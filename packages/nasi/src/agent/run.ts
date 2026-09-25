import { LOCAL_OWNER } from "@kaja/schema/store"
import { file } from "bun"
import OpenAI from "openai"
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from "openai/resources/chat/completions"
import { takeLastServedModel } from "../models/client"
import { lowerContextWindow, resolveContextWindow } from "../models/context-window"
import {
  type Agent,
  type AgentEvent,
  ASK_USER_TOOL,
  type CallStat,
  RUN_COMMAND_TOOL,
  type Session,
  SWITCH_PERSONA_TOOL
} from "./agent"
import { isDangerousCommand } from "./command-risk"
import {
  compactSession,
  condenseOversizedResults,
  contextMessages,
  DEFAULT_COMPACT_AT,
  estimateTokens,
  isContextOverflow
} from "./compaction"
import { runShellCommand } from "./run-command"
import { applyPersonaToMessages, buildSystemPrompt, refreshAbilitiesInPrompt } from "./system-prompt"
import { msSince, recordCall, recordModelCall, recordStep } from "./telemetry"
import { type ModelCallUsage, type Tool, toolName } from "./tools"

/** Notes how a call went, keyed by its id. */
type RecordCall = (callId: string, stat: CallStat) => void

type FunctionToolCall = {
  type: "function"
  id: string
  function: { name: string; arguments: string }
}

function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Auto-runs read-only allowlisted commands; otherwise reports a pending confirmation. */
const AUTO_APPROVE_BINARIES = /^(ls|cat|head|tail|git status|git diff|git log|pwd|whoami|date|uname|echo|true)(\s|$)/

// Shell metacharacters that let a command chain into, pipe into, or substitute in another command
// (`sh -c` interprets all of these) — auto-approval requires none of them, so the allowlist above
// only ever matches a single simple invocation, never a smuggled second command.
const SHELL_METACHARACTERS = /[;&|`$(){}<>\n]/

function isSimpleAllowlistedCommand(command: string): boolean {
  return !SHELL_METACHARACTERS.test(command) && AUTO_APPROVE_BINARIES.test(command.trim())
}

async function handleRunCommandCall(
  messages: ChatCompletionMessageParam[],
  call: FunctionToolCall,
  record: RecordCall
): Promise<{ id: string; command: string; description: string } | undefined> {
  const args = parseToolArgs(call.function.arguments) as {
    command?: string
    description?: string
    mutates?: boolean
  } | null
  if (!args || typeof args.command !== "string") {
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: "Invalid run_command arguments."
    })
    record(call.id, { status: "error" })
    return undefined
  }
  const autoApprove =
    args.mutates === false && !isDangerousCommand(args.command) && isSimpleAllowlistedCommand(args.command)
  if (autoApprove) {
    const startedAt = performance.now()
    const result = await runShellCommand(args.command)
    messages.push({ role: "tool", tool_call_id: call.id, content: result })
    record(call.id, { status: "ok", durationMs: msSince(startedAt) })
    return undefined
  }
  return { id: call.id, command: args.command, description: args.description ?? "" }
}

async function* handleSwitchPersonaCall(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  call: FunctionToolCall,
  record: RecordCall
): AsyncGenerator<AgentEvent, void, void> {
  yield { type: "tool_call", name: call.function.name, arguments: call.function.arguments }
  const args = parseToolArgs(call.function.arguments) as { persona?: string } | null
  const target = args?.persona ? agent.personas.find(p => p.id === args.persona) : undefined
  let content: string
  if (!target) {
    content = `Unknown persona "${args?.persona ?? ""}". Available: ` + `${agent.personas.map(p => p.id).join(", ")}.`
  } else if (target.id === agent.personaId) {
    content = `Already using persona "${target.id}".`
  } else {
    await applyPersonaToMessages(agent, target, messages)
    yield { type: "persona_switch", personaId: target.id, label: target.label }
    content =
      `Persona switched to "${target.label}" (${target.id}). Your ` +
      `system instructions have been updated — continue in this persona.`
  }
  messages.push({ role: "tool", tool_call_id: call.id, content })
  record(call.id, { status: target ? "ok" : "error" })
}

async function* handleToolCall(
  agent: Agent,
  toolsByName: Map<string, Tool<any>>,
  messages: ChatCompletionMessageParam[],
  owner: string | null,
  call: FunctionToolCall,
  record: RecordCall,
  onModelCall: (usage: ModelCallUsage) => void
): AsyncGenerator<AgentEvent, void, void> {
  yield { type: "tool_call", name: call.function.name, arguments: call.function.arguments }
  const t = toolsByName.get(call.function.name)
  if (!t) {
    messages.push({ role: "tool", tool_call_id: call.id, content: `Error: unknown tool "${call.function.name}"` })
    record(call.id, { status: "error" })
    return
  }
  const args = parseToolArgs(call.function.arguments)
  if (args === null) {
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: "Invalid JSON in tool arguments."
    })
    record(call.id, { status: "error" })
    return
  }
  const startedAt = performance.now()
  let result: Awaited<ReturnType<typeof t.execute>>
  try {
    result = await t.execute(args, {
      owner,
      personaId: agent.personaId,
      store: agent.store,
      onModelCall
    })
  } catch (error) {
    // The model gets the failure as the call's result, so the turn goes on and the session stays valid.
    const reason = error instanceof Error ? error.message : String(error)
    messages.push({ role: "tool", tool_call_id: call.id, content: `Error: ${reason}` })
    record(call.id, { status: "error", durationMs: msSince(startedAt) })
    return
  }
  record(call.id, { status: "ok", durationMs: msSince(startedAt) })

  if (typeof result === "string") {
    messages.push({ role: "tool", tool_call_id: call.id, content: result })
    return
  }

  messages.push({ role: "tool", tool_call_id: call.id, content: result.text })
  if (result.displayImage) yield { type: "display_image", ...result.displayImage }
  for (const image of result.images ?? []) {
    yield { type: "tool_image", path: image.path }
    const data = await file(image.path).arrayBuffer()
    const base64 = Buffer.from(data).toString("base64")
    messages.push({
      role: "user",
      content: [{ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${base64}` } }]
    })
  }
}

type StreamedRound = {
  message: {
    role: "assistant"
    content: string | null
    tool_calls?: ChatCompletionMessageToolCall[]
    reasoning_content?: string
  }
  thinking: string
  usage?: { promptTokens: number }
  completionTokens?: number
  finishReason?: string
  latencyMs: number
  model?: string
}

// Model and token counts the stream's chunks report; the last one seen wins.
type ChunkMeta = { model?: string; promptTokens?: number; completionTokens?: number }

function noteChunk(meta: ChunkMeta, chunk: ChatCompletionChunk): void {
  if (chunk.model) meta.model = chunk.model
  if (chunk.usage?.prompt_tokens != null) meta.promptTokens = chunk.usage.prompt_tokens
  if (chunk.usage?.completion_tokens != null) meta.completionTokens = chunk.usage.completion_tokens
}

async function* streamRound(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  definitions: import("openai/resources/chat/completions").ChatCompletionTool[]
): AsyncGenerator<AgentEvent, StreamedRound, void> {
  const startedAt = performance.now()
  const stream = agent.client.chat.completions.stream({
    model: agent.model,
    messages,
    tools: definitions,
    stream_options: { include_usage: true },
    ...agent.sampling
  })

  let thinking = ""
  const meta: ChunkMeta = {}

  try {
    for await (const chunk of stream) {
      noteChunk(meta, chunk)
      const delta = chunk.choices[0]?.delta as
        | { reasoning_content?: string; reasoning?: string; content?: string }
        | undefined
      const reasoning = delta?.reasoning_content ?? delta?.reasoning
      if (reasoning) {
        thinking += reasoning
        yield { type: "delta", channel: "reasoning", text: reasoning }
      }
      if (delta?.content) yield { type: "delta", channel: "content", text: delta.content }
    }
  } catch (cause) {
    if (cause instanceof OpenAI.APIError) {
      // Hosts map this name to "the model provider failed"; `contextOverflow` lets run() compact and retry first.
      const err = Object.assign(new Error(`Model provider request failed: ${cause.message}`), {
        contextOverflow: isContextOverflow(cause)
      })
      err.name = "NasiModelUnavailable"
      throw err
    }
    throw cause
  }

  const completion = await stream.finalChatCompletion()
  const raw = completion.choices[0]!.message
  const message = {
    role: "assistant" as const,
    content: raw.content,
    ...(raw.tool_calls?.length ? { tool_calls: raw.tool_calls } : {}),
    ...(thinking ? { reasoning_content: thinking } : {})
  }

  const servedModel = takeLastServedModel() || meta.model || completion.model || undefined
  const promptTokens = meta.promptTokens ?? completion.usage?.prompt_tokens

  return {
    message,
    thinking,
    usage: promptTokens != null ? { promptTokens } : undefined,
    completionTokens: meta.completionTokens ?? completion.usage?.completion_tokens,
    finishReason: completion.choices[0]!.finish_reason ?? undefined,
    latencyMs: msSince(startedAt),
    model: servedModel
  }
}

function pushPromptToMessages(session: Session, prompt: string, images: string[]): void {
  pushPromptText(session, prompt, images)
  // A tool result can't carry an image, so one sent with an answer follows as its own user message
  if (images.length > 0 && session.messages.at(-1)?.role === "tool")
    session.messages.push({ role: "user", content: images.map(imagePart) })
}

function imagePart(url: string) {
  return { type: "image_url" as const, image_url: { url } }
}

function pushPromptText(session: Session, prompt: string, images: string[]): void {
  if (session.pendingAskUserId) {
    session.messages.push({
      role: "tool",
      tool_call_id: session.pendingAskUserId,
      content: prompt
    })
    session.pendingAskUserId = undefined
  } else if (session.pendingRunCommandId) {
    session.messages.push({
      role: "tool",
      tool_call_id: session.pendingRunCommandId,
      content: prompt
    })
    session.pendingRunCommandId = undefined
  } else if (session.pendingClientToolCallId) {
    session.messages.push({
      role: "tool",
      tool_call_id: session.pendingClientToolCallId,
      content: prompt
    })
    session.pendingClientToolCallId = undefined
  } else if (session.pendingToolApprovalId) {
    session.messages.push({
      role: "tool",
      tool_call_id: session.pendingToolApprovalId,
      content: prompt
    })
    session.pendingToolApprovalId = undefined
  } else if (images.length > 0) {
    const text = prompt ? [{ type: "text" as const, text: prompt }] : []
    session.messages.push({ role: "user", content: [...text, ...images.map(imagePart)] })
  } else {
    session.messages.push({ role: "user", content: prompt })
  }
}

/** Placeholder a dropped image leaves, so the model still knows one was sent. */
const DROPPED_IMAGE = "[The user sent an image here, but this model can't view images.]"

/**
 * Replaces the image parts of the messages from `from` on with a text note: after a turn with a photo failed (most
 * likely on a model that can't see images), so the session doesn't send the same image, and fail, on every later turn.
 */
export function dropImages(session: Session, from: number): void {
  for (const message of session.messages.slice(from)) {
    if (message.role !== "user" || !Array.isArray(message.content)) continue
    message.content = message.content.map(part =>
      part.type === "image_url" ? { type: "text" as const, text: DROPPED_IMAGE } : part
    )
  }
}

function handleAskUserCall(call: FunctionToolCall): { id: string; question: string; note?: string } {
  const args = parseToolArgs(call.function.arguments) as { question?: string; note?: string } | null
  return {
    id: call.id,
    question: typeof args?.question === "string" ? args.question : "",
    note: typeof args?.note === "string" && args.note.trim() ? args.note : undefined
  }
}

async function* handleToolCalls(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  owner: string | null,
  toolsByName: Map<string, Tool<any>>,
  toolCalls: ChatCompletionMessageToolCall[],
  record: RecordCall,
  onModelCall: (usage: ModelCallUsage) => void
): AsyncGenerator<
  AgentEvent,
  {
    ask?: { id: string; question: string; note?: string }
    confirm?: { id: string; command: string; description: string }
    clientTool?: { id: string; name: string; arguments: string }
    approval?: ToolApproval
  },
  void
> {
  let ask: { id: string; question: string; note?: string } | undefined
  let confirm: { id: string; command: string; description: string } | undefined
  let clientTool: { id: string; name: string; arguments: string } | undefined
  let approval: ToolApproval | undefined
  for (const call of toolCalls) {
    if (call.type !== "function") continue

    if (call.function.name === ASK_USER_TOOL) {
      ask = handleAskUserCall(call)
      continue
    }

    if (call.function.name === RUN_COMMAND_TOOL) {
      confirm = await handleRunCommandCall(messages, call, record)
      continue
    }

    if (call.function.name === SWITCH_PERSONA_TOOL) {
      yield* handleSwitchPersonaCall(agent, messages, call, record)
      continue
    }

    if (toolsByName.get(call.function.name)?.requiresClientExecution) {
      clientTool = { id: call.id, name: call.function.name, arguments: call.function.arguments }
      continue
    }

    const summary = approvalSummaryFor(toolsByName.get(call.function.name), call)
    if (summary !== undefined) {
      approval = holdApproval(messages, record, approval, {
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        summary
      })
      continue
    }

    yield* handleToolCall(agent, toolsByName, messages, owner, call, record, onModelCall)
  }
  // Another pause (ask_user, run_command, a client tool) wins the handoff; answer the approval now rather than leave its call unanswered.
  if (approval && [ask, confirm, clientTool].some(Boolean)) {
    messages.push({ role: "tool", tool_call_id: approval.id, content: ONE_APPROVAL_AT_A_TIME })
    record(approval.id, { status: "skipped" })
    approval = undefined
  }
  return { ask, confirm, clientTool, approval }
}

type ToolApproval = { id: string; name: string; arguments: string; summary: string }

const ONE_APPROVAL_AT_A_TIME = "Not run: another step is waiting on the user first. Call this tool again afterwards."

// Only one approval can pause a turn; a second one in the same round is answered now so every tool call keeps a response.
function holdApproval(
  messages: ChatCompletionMessageParam[],
  record: RecordCall,
  held: ToolApproval | undefined,
  next: ToolApproval
) {
  if (!held) return next
  messages.push({ role: "tool", tool_call_id: next.id, content: ONE_APPROVAL_AT_A_TIME })
  record(next.id, { status: "skipped" })
  return held
}

/** The approval summary when `tool` wants the human to confirm this call first, else undefined. */
function approvalSummaryFor(tool: Tool<any> | undefined, call: FunctionToolCall): string | undefined {
  if (!tool?.approval) return undefined
  const args = parseToolArgs(call.function.arguments)
  return args === null ? undefined : tool.approval(args)
}

const TRAILING_TOOL_TAG = /<\/(?:parameter|invoke)>\s*$/

/** Some models leak literal tool-call closing tags into plain content instead of using structured `tool_calls`. */
function stripLeakedToolTags(content: string): string {
  let result = content.trimEnd()
  while (TRAILING_TOOL_TAG.test(result)) {
    result = result.replace(TRAILING_TOOL_TAG, "").trimEnd()
  }
  return result
}

/** Shown when the model still has nothing to say after exhausting empty-round retries — the app must never surface a blank reply. */
const STUCK_FALLBACK_MESSAGE =
  "I'm drawing a blank on that one — want to give me a hint, or should we start a new round?"

function finalEventFor(message: StreamedRound["message"]): AgentEvent {
  const stripped = typeof message.content === "string" ? stripLeakedToolTags(message.content) : ""
  const content = stripped.trim().length > 0 ? stripped : STUCK_FALLBACK_MESSAGE
  return content.trimEnd().endsWith("?") ? { type: "ask_user", question: content } : { type: "final", content }
}

/** True when a round produced neither a tool call nor any visible text — a dead end some models hit under pressure (e.g. near a persona's turn budget). */
function isEmptyRound(message: StreamedRound["message"]): boolean {
  if (message.tool_calls?.length) return false
  const content = typeof message.content === "string" ? stripLeakedToolTags(message.content) : ""
  return content.trim().length === 0
}

/** Stops the run after this many rounds in a row where every tool call failed, so a model can't retry a broken tool forever. */
const MAX_FAILING_TOOL_ROUNDS = 3

/** Retries an empty round this many times before giving up and yielding it as-is. */
const MAX_EMPTY_ROUND_RETRIES = 5

/**
 * The nudge pushed after a round came back with nothing. Escalates to a blunt
 * forced guess on the last attempt, since "ask or guess" alone isn't decisive
 * enough for a model that's genuinely stuck.
 */
function emptyRoundNudge(retries: number): string {
  return retries < MAX_EMPTY_ROUND_RETRIES
    ? "That reply was empty. Ask your next question, or give your best guess now — don't leave this turn blank."
    : "You still haven't said anything. Stop deliberating: state your single best guess right now, in one short sentence, even if you're unsure. Do not leave this blank again."
}

/** Per-round telemetry: token usage/model, then any reasoning text. */
function* roundTelemetry(
  round: Pick<StreamedRound, "thinking" | "usage" | "model">,
  contextWindow: number | undefined
): Generator<AgentEvent, void, void> {
  const { thinking, usage, model } = round
  if (usage || model) yield { type: "usage", promptTokens: usage?.promptTokens, model, contextWindow }
  if (thinking) yield { type: "reasoning", text: thinking }
}

function* handlePendingHandoff(
  session: Session,
  ask: { id: string; question: string; note?: string } | undefined,
  confirm: { id: string; command: string; description: string } | undefined,
  clientTool: { id: string; name: string; arguments: string } | undefined,
  approval: ToolApproval | undefined
): Generator<AgentEvent, boolean, void> {
  if (ask) {
    session.pendingAskUserId = ask.id
    yield { type: "ask_user", question: ask.question, note: ask.note }
    return true
  }

  if (confirm) {
    session.pendingRunCommandId = confirm.id
    yield {
      type: "confirm_command",
      command: confirm.command,
      description: confirm.description
    }
    return true
  }

  if (clientTool) {
    session.pendingClientToolCallId = clientTool.id
    yield { type: "client_tool_call", name: clientTool.name, arguments: clientTool.arguments }
    return true
  }

  if (approval) {
    session.pendingToolApprovalId = approval.id
    yield {
      type: "confirm_tool",
      id: approval.id,
      name: approval.name,
      arguments: approval.arguments,
      summary: approval.summary
    }
    return true
  }

  return false
}

// Seeds a new conversation's system prompt (or refreshes an ongoing one's abilities), then adds the prompt.
async function openTurn(
  agent: Agent,
  session: Session,
  prompt: string,
  owner: string | null,
  images: string[]
): Promise<void> {
  const messages = session.messages
  if (messages.length === 0) {
    const system = await buildSystemPrompt(agent, owner)
    if (system) messages.push({ role: "system", content: system })
  } else {
    await refreshAbilitiesInPrompt(agent, messages, owner)
  }
  pushPromptToMessages(session, prompt, images)
}

// Records the telemetry step for the round whose message was just appended.
function recordRound(agent: Agent, session: Session, round: StreamedRound): void {
  const messages = session.messages
  recordStep(session, {
    at: messages.length - 1 - (messages[0]?.role === "system" ? 1 : 0),
    model: round.model ?? agent.model,
    persona: agent.personaId,
    promptTokens: round.usage?.promptTokens,
    completionTokens: round.completionTokens,
    latencyMs: round.latencyMs,
    finishReason: round.finishReason
  })
}

/** Fills {@link Agent.contextWindow} from the resolved model entry the agent runs, when the host didn't set it. */
async function ensureContextWindow(agent: Agent): Promise<void> {
  if (agent.contextWindow != null) return
  const entry = agent.models?.find(m => m.task === "chat" && m.model === agent.model)
  if (!entry) return
  agent.contextWindow = (await resolveContextWindow(entry)).tokens
}

/** Compacts the session before a round when its estimate passes {@link Agent.compactAt} of the window, or always when `force`d. */
async function* compactIfNeeded(
  agent: Agent,
  session: Session,
  definitions: readonly unknown[],
  estimateScale: number,
  force = false
): AsyncGenerator<AgentEvent, boolean, void> {
  await ensureContextWindow(agent)
  if (!agent.contextWindow) return false
  const estimate = estimateTokens(contextMessages(session), definitions) * estimateScale
  if (!force && estimate <= (agent.compactAt ?? DEFAULT_COMPACT_AT) * agent.contextWindow) return false
  const result = await compactSession(agent, session, { definitions })
  if (!result) return false
  yield {
    type: "compacted",
    beforeTokens: Math.round(result.beforeTokens * estimateScale),
    afterTokens: Math.round(result.afterTokens * estimateScale),
    dropped: result.dropped
  }
  return true
}

// Streams one round; when the provider says the prompt is too long, shrinks the known window below it, compacts and tries once more.
async function* streamRoundFitting(
  agent: Agent,
  session: Session,
  definitions: import("openai/resources/chat/completions").ChatCompletionTool[],
  estimateScale: number
): AsyncGenerator<AgentEvent, StreamedRound, void> {
  try {
    return yield* streamRound(agent, contextMessages(session), definitions)
  } catch (error) {
    if (!(error as { contextOverflow?: boolean } | undefined)?.contextOverflow) throw error
    const sent = Math.round(estimateTokens(contextMessages(session), definitions) * estimateScale)
    const smaller = Math.floor(Math.min(agent.contextWindow ?? sent, sent) * 0.9)
    agent.contextWindow = smaller
    const entry = agent.models?.find(m => m.task === "chat" && m.model === agent.model)
    if (entry) lowerContextWindow(entry, smaller)
    if (!(yield* compactIfNeeded(agent, session, definitions, estimateScale, true))) throw error
    return yield* streamRound(agent, contextMessages(session), definitions)
  }
}

/** Compacts the session now (`/compact`), whatever its size, keeping only the latest turn; `focus` steers what the summary keeps. Undefined when there is nothing to summarise yet. */
export async function compact(agent: Agent, session: Session, focus?: string) {
  await ensureContextWindow(agent)
  return compactSession(agent, session, { focus, definitions: agent.tools.map(t => t.definition), lastTurnOnly: true })
}

/**
 * Runs an {@link Agent} on a prompt to completion, looping through
 * tool calls until the model asks the user a question or returns a final message.
 * `images` (data URLs) go to the model with the prompt, e.g. a photo sent to a bot.
 */
export async function* run(
  agent: Agent,
  prompt: string,
  session: Session,
  owner: string | null = LOCAL_OWNER,
  images: string[] = []
): AsyncGenerator<AgentEvent, void, void> {
  const toolsByName = new Map(agent.tools.map(t => [toolName(t), t]))
  const definitions = agent.tools.map(t => t.definition)
  const messages = session.messages
  await openTurn(agent, session, prompt, owner, images)

  let emptyRoundRetries = 0
  let failingToolRounds = 0
  // Scales the character estimate to what the provider counted last round.
  let estimateScale = 1
  while (true) {
    await ensureContextWindow(agent)
    for (const condensed of await condenseOversizedResults(agent, session)) yield { type: "condensed", ...condensed }
    yield* compactIfNeeded(agent, session, definitions, estimateScale)
    const round = yield* streamRoundFitting(agent, session, definitions, estimateScale)
    const { message, thinking, usage, model } = round
    // Nothing is appended yet, so this is exactly what was sent.
    const estimate = estimateTokens(contextMessages(session), definitions)
    if (usage?.promptTokens && estimate > 0) estimateScale = Math.min(3, Math.max(0.33, usage.promptTokens / estimate))

    if (isEmptyRound(message) && emptyRoundRetries < MAX_EMPTY_ROUND_RETRIES) {
      emptyRoundRetries++
      // Drop the empty turn rather than persisting it — replace with a nudge and retry.
      messages.push({ role: "user", content: emptyRoundNudge(emptyRoundRetries) })
      continue
    }

    messages.push(message)
    recordRound(agent, session, round)

    // Per round: a persona switch mid-turn can move to a model with another window.
    await ensureContextWindow(agent)
    yield* roundTelemetry({ thinking, usage, model }, agent.contextWindow)

    if (!message.tool_calls?.length) {
      yield finalEventFor(message)
      return
    }

    if (typeof message.content === "string" && message.content.trim())
      yield { type: "message", content: message.content }

    const { ask, confirm, clientTool, approval } = yield* handleToolCalls(
      agent,
      messages,
      owner,
      toolsByName,
      message.tool_calls,
      (callId, stat) => recordCall(session, callId, stat),
      usage => recordModelCall(session, { kind: "summarize", ...usage })
    )

    const everyCallFailed = message.tool_calls.every(call => session.telemetry?.calls[call.id]?.status === "error")
    failingToolRounds = everyCallFailed ? failingToolRounds + 1 : 0
    if (failingToolRounds >= MAX_FAILING_TOOL_ROUNDS) {
      throw new Error(`Stopped: every tool call failed ${MAX_FAILING_TOOL_ROUNDS} rounds in a row.`)
    }

    if (yield* handlePendingHandoff(session, ask, confirm, clientTool, approval)) return
  }
}
