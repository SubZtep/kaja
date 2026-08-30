import { LOCAL_OWNER } from "@kaja/schema/store"
import { file } from "bun"
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions"
import { takeLastServedModel } from "../models/client"
import {
  type Agent,
  type AgentEvent,
  ASK_USER_TOOL,
  RUN_COMMAND_TOOL,
  type Session,
  SWITCH_PERSONA_TOOL
} from "./agent"
import { isDangerousCommand } from "./command-risk"
import { runShellCommand } from "./run-command"
import { applyPersonaToMessages, buildSystemPrompt } from "./system-prompt"
import { type Tool, toolName } from "./tools"

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

async function handleRunCommandCall(
  messages: ChatCompletionMessageParam[],
  call: FunctionToolCall
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
    return undefined
  }
  const autoApprove =
    args.mutates === false && !isDangerousCommand(args.command) && AUTO_APPROVE_BINARIES.test(args.command.trim())
  if (autoApprove) {
    const result = await runShellCommand(args.command)
    messages.push({ role: "tool", tool_call_id: call.id, content: result })
    return undefined
  }
  return { id: call.id, command: args.command, description: args.description ?? "" }
}

async function* handleSwitchPersonaCall(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  call: FunctionToolCall
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
}

async function* handleToolCall(
  agent: Agent,
  toolsByName: Map<string, Tool<any>>,
  messages: ChatCompletionMessageParam[],
  owner: string | null,
  call: FunctionToolCall
): AsyncGenerator<AgentEvent, void, void> {
  yield { type: "tool_call", name: call.function.name, arguments: call.function.arguments }
  const t = toolsByName.get(call.function.name)
  if (!t) throw new Error(`Unknown tool: ${call.function.name}`)
  const args = parseToolArgs(call.function.arguments)
  if (args === null) {
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: "Invalid JSON in tool arguments."
    })
    return
  }
  const result = await t.execute(args, { owner, personaId: agent.personaId })

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
  model?: string
}

async function* streamRound(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  definitions: import("openai/resources/chat/completions").ChatCompletionTool[]
): AsyncGenerator<AgentEvent, StreamedRound, void> {
  const stream = agent.client.chat.completions.stream({
    model: agent.model,
    messages,
    tools: definitions,
    stream_options: { include_usage: true },
    ...agent.sampling
  })

  let thinking = ""
  let chunkModel: string | undefined
  let chunkPromptTokens: number | undefined
  for await (const chunk of stream) {
    if (chunk.model) chunkModel = chunk.model
    if (chunk.usage?.prompt_tokens != null) chunkPromptTokens = chunk.usage.prompt_tokens
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

  const completion = await stream.finalChatCompletion()
  const raw = completion.choices[0]!.message
  const message = {
    role: "assistant" as const,
    content: raw.content,
    ...(raw.tool_calls?.length ? { tool_calls: raw.tool_calls } : {}),
    ...(thinking ? { reasoning_content: thinking } : {})
  }

  const servedModel = takeLastServedModel() || chunkModel || completion.model || undefined
  const promptTokens = chunkPromptTokens ?? completion.usage?.prompt_tokens

  return {
    message,
    thinking,
    usage: promptTokens != null ? { promptTokens } : undefined,
    model: servedModel
  }
}

function pushPromptToMessages(session: Session, prompt: string): void {
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
  } else {
    session.messages.push({ role: "user", content: prompt })
  }
}

async function* handleToolCalls(
  agent: Agent,
  messages: ChatCompletionMessageParam[],
  owner: string | null,
  toolsByName: Map<string, Tool<any>>,
  toolCalls: ChatCompletionMessageToolCall[]
): AsyncGenerator<
  AgentEvent,
  { ask?: { id: string; question: string }; confirm?: { id: string; command: string; description: string } },
  void
> {
  let ask: { id: string; question: string } | undefined
  let confirm: { id: string; command: string; description: string } | undefined
  for (const call of toolCalls) {
    if (call.type !== "function") continue

    if (call.function.name === ASK_USER_TOOL) {
      const args = parseToolArgs(call.function.arguments) as { question?: string } | null
      ask = { id: call.id, question: typeof args?.question === "string" ? args.question : "" }
      continue
    }

    if (call.function.name === RUN_COMMAND_TOOL) {
      confirm = await handleRunCommandCall(messages, call)
      continue
    }

    if (call.function.name === SWITCH_PERSONA_TOOL) {
      yield* handleSwitchPersonaCall(agent, messages, call)
      continue
    }

    yield* handleToolCall(agent, toolsByName, messages, owner, call)
  }
  return { ask, confirm }
}

function finalEventFor(message: StreamedRound["message"]): AgentEvent {
  const content = typeof message.content === "string" ? message.content : null
  return content?.trimEnd().endsWith("?")
    ? { type: "ask_user", question: content }
    : { type: "final", content: message.content }
}

function* handlePendingHandoff(
  session: Session,
  ask: { id: string; question: string } | undefined,
  confirm: { id: string; command: string; description: string } | undefined
): Generator<AgentEvent, boolean, void> {
  if (ask) {
    session.pendingAskUserId = ask.id
    yield { type: "ask_user", question: ask.question }
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

  return false
}

/**
 * Runs an {@link Agent} on a prompt to completion, looping through
 * tool calls until the model asks the user a question or returns a final message.
 */
export async function* run(
  agent: Agent,
  prompt: string,
  session: Session,
  owner: string | null = LOCAL_OWNER
): AsyncGenerator<AgentEvent, void, void> {
  const toolsByName = new Map(agent.tools.map(t => [toolName(t), t]))
  const definitions = agent.tools.map(t => t.definition)
  const messages = session.messages

  if (messages.length === 0) {
    const system = await buildSystemPrompt(agent)
    if (system) messages.push({ role: "system", content: system })
  }

  pushPromptToMessages(session, prompt)

  while (true) {
    const { message, thinking, usage, model } = yield* streamRound(agent, messages, definitions)
    messages.push(message)

    if (usage || model) yield { type: "usage", promptTokens: usage?.promptTokens, model }

    if (thinking) yield { type: "reasoning", text: thinking }

    if (!message.tool_calls?.length) {
      yield finalEventFor(message)
      return
    }

    if (typeof message.content === "string" && message.content.trim())
      yield { type: "message", content: message.content }

    const { ask, confirm } = yield* handleToolCalls(agent, messages, owner, toolsByName, message.tool_calls)

    if (yield* handlePendingHandoff(session, ask, confirm)) return
  }
}
