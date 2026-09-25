import type { Persona } from "@kaja/schema/cli"
import type { NasiStep, NasiTurnRequest, NasiTurnResponse, NasiTurnStatus } from "@kaja/schema/nasi"
import type OpenAI from "openai"
import { loadAbilities } from "./abilities/load"
import type { AbilityStore } from "./abilities/types"
import { Agent, type AgentEvent, createSession, type PromptContext, type Session } from "./agent/agent"
import type { Compaction } from "./agent/compaction"
import { samplingOf } from "./agent/persona"
import { compact, run } from "./agent/run"
import { recordPausedCall } from "./agent/telemetry"
import { runApprovedTool, type Tool } from "./agent/tools"
import { createGuardedFetch } from "./security/ssrf"
import type { NasiStore } from "./store/types"
import type { NasiToolDeps } from "./tools/deps"
import { createTools } from "./tools/registry"

export type NasiOpenOptions = {
  store: NasiStore
  /** `contextWindow`: the model's size in tokens, when the host knows it (the cloud resolves it per model row). */
  chat: { client: OpenAI; model: string; contextWindow?: number }
  /** Writes compaction summaries, condenses oversized tool results and runs the `summarize` tool; defaults to {@link chat}. */
  summarizer?: { client: OpenAI; model: string; contextWindow?: number }
  /** Files, shell, MCP, and plugins. Default false. */
  includeLocalTools?: boolean
  /** Cloud only: whether the caller can run `client_tool_call` tools (`read_file`/`list_files`) on the user's machine. Default true. */
  clientTools?: boolean
  personas?: Persona[]
  promptContext?: PromptContext
  owner?: string | null
  /** Extra tool dependencies merged over `chat` — gates dep-conditional tools (e.g. `fetch_url` needs `fetchProxy`). */
  deps?: Omit<NasiToolDeps, "chat">
  /** Where this caller's enabled abilities come from (the cloud: Postgres); their tools join through `loadAbilities`, egressing through `deps.fetchProxy` when set. */
  abilities?: AbilityStore
  /** An ability's API key (the cloud decrypts the caller's own up front). Never shown to the model. */
  abilityKey?: (abilityName: string) => string | undefined
  /** How long each MCP ability gets to connect when the turn opens before it's left out. Default 5 s. */
  mcpConnectTimeoutMs?: number
}

const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 5_000

/** A turn as the host runs it: the HTTP request, plus images (data URLs) a host like the Telegram bot got with the message. */
export type NasiTurnInput = NasiTurnRequest & { images?: string[] }

/** How a message sent with a photo shows in history and titles: "📷", then its caption. */
export function photoLabel(caption: string): string {
  return caption ? `📷 ${caption}` : "📷"
}

/** The user's message as history shows it. */
function userText(input: NasiTurnInput): string {
  const message = input.message ?? ""
  return input.images?.length ? photoLabel(message) : message
}

function lastOf<T extends AgentEvent["type"]>(events: AgentEvent[], type: T) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]!
    if (event.type === type) return event as Extract<AgentEvent, { type: T }>
  }
}

function stepFromEvent(event: AgentEvent, includeThinking: boolean): NasiStep | undefined {
  switch (event.type) {
    case "reasoning":
      return includeThinking ? { type: "reasoning", text: event.text } : undefined
    case "message":
      return { type: "message", content: event.content }
    case "tool_call":
      return { type: "tool_call", name: event.name, arguments: event.arguments }
    case "ask_user":
      return { type: "ask_user", question: event.question }
    case "persona_switch":
      return { type: "persona_switch", personaId: event.personaId, label: event.label }
    case "confirm_command":
      return { type: "confirm_command", command: event.command, description: event.description }
    case "client_tool_call":
      return { type: "client_tool_call", name: event.name, arguments: event.arguments }
    case "confirm_tool":
      return { type: "confirm_tool", name: event.name, arguments: event.arguments, summary: event.summary }
    default:
      return undefined
  }
}

function stepsFromEvents(events: AgentEvent[], includeThinking: boolean): NasiStep[] {
  const steps: NasiStep[] = []
  for (const event of events) {
    const step = stepFromEvent(event, includeThinking)
    if (step) steps.push(step)
  }
  return steps
}

function statusFromEvents(session: Session): NasiTurnStatus {
  if (session.pendingAskUserId) return "needs_input"
  if (session.pendingRunCommandId || session.pendingToolApprovalId) return "needs_approval"
  if (session.pendingClientToolCallId) return "needs_client_tool"
  return "completed"
}

function messageFromEvents(events: AgentEvent[], status: NasiTurnStatus): string {
  if (status === "needs_input") return lastOf(events, "ask_user")?.question ?? ""
  const fin = lastOf(events, "final")
  if (fin) return fin.content ?? ""
  // Trailing-`?` backstop yields ask_user without pendingAskUserId — still the visible reply.
  return lastOf(events, "ask_user")?.question ?? lastOf(events, "message")?.content ?? ""
}

/** The tool result a declined approval leaves, same wording as the CLI's. */
const TOOL_DECLINED = "User declined this request."

/** The saved function call a pending approval refers to, from the assistant message that made it. */
export function pendingToolCall(session: Session, id: string) {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const message = session.messages[i]!
    if (message.role !== "assistant") continue
    const call = message.tool_calls?.find(candidate => candidate.id === id)
    if (call?.type === "function") return call
  }
}

type LoadedTurn = {
  agent: Agent
  session: Session
  sessionId: string | undefined
  events: unknown[]
  title: string
}

async function persistTurn(
  opts: NasiOpenOptions,
  loaded: LoadedTurn,
  input: NasiTurnInput,
  turnEvents: AgentEvent[]
): Promise<string> {
  const persistedEvents = [
    ...loaded.events,
    input.approval
      ? { type: "tool_approval", approved: input.approval === "approve" }
      : { type: "user", text: userText(input) },
    ...turnEvents.filter(e => e.type !== "delta" && e.type !== "usage")
  ]
  const row = {
    persona: loaded.agent.personaId ?? "default",
    model: loaded.agent.model,
    owner: opts.owner ?? null,
    session: loaded.session,
    events: persistedEvents
  }
  if (!loaded.sessionId) return opts.store.createSession({ ...row, title: loaded.title })
  await opts.store.updateSession(loaded.sessionId, row)
  return loaded.sessionId
}

function responseFromEvents(
  sessionId: string,
  session: Session,
  turnEvents: AgentEvent[],
  includeThinking: boolean
): NasiTurnResponse {
  const status = statusFromEvents(session)
  const usage = lastOf(turnEvents, "usage")
  const thinking = includeThinking
    ? turnEvents
        .filter(e => e.type === "reasoning")
        .map(e => (e.type === "reasoning" ? e.text : ""))
        .join("")
    : undefined

  return {
    session: sessionId,
    status,
    message: messageFromEvents(turnEvents, status),
    steps: stepsFromEvents(turnEvents, includeThinking),
    ...(thinking ? { thinking } : {}),
    ...(usage
      ? { usage: { promptTokens: usage.promptTokens, model: usage.model, contextWindow: usage.contextWindow } }
      : {})
  }
}

export class Nasi {
  readonly opts: NasiOpenOptions
  private readonly tools: Tool<any>[]
  private readonly closeTools: () => Promise<void>

  private constructor(opts: NasiOpenOptions, tools: Tool<any>[], closeTools: () => Promise<void>) {
    this.opts = opts
    this.tools = tools
    this.closeTools = closeTools
  }

  static async open(opts: NasiOpenOptions) {
    const abilities = opts.abilities
      ? await loadAbilities(opts.abilities, {
          personas: opts.personas,
          getApiKey: opts.abilityKey,
          proxy: opts.deps?.fetchProxy
        })
      : undefined
    const { tools, closeTools } = await createTools({
      includeLocalTools: opts.includeLocalTools,
      clientTools: opts.clientTools,
      deps: { ...opts.deps, chat: opts.chat, summarizer: opts.summarizer },
      extraTools: abilities?.groups,
      // MCP abilities connect when the instance opens, through the same egress rules as every other cloud request.
      mcpAbilities: abilities?.mcp,
      mcpFetch: createGuardedFetch({ proxy: opts.deps?.fetchProxy }),
      mcpConnectTimeoutMs: opts.mcpConnectTimeoutMs ?? DEFAULT_MCP_CONNECT_TIMEOUT_MS
    })
    return new Nasi(opts, tools, closeTools)
  }

  /** Closes the instance's MCP connections. Hosts that open one per turn call it once the turn is over. */
  close(): Promise<void> {
    return this.closeTools()
  }

  private async loadTurn(input: NasiTurnInput): Promise<LoadedTurn> {
    const personas = this.opts.personas ?? []

    const sessionId = input.session
    let session = createSession()
    let events: unknown[] = []
    let title = userText(input)
      .split(/[\r\n]/)[0]!
      .slice(0, 60)
    let storedPersona: string | undefined

    if (sessionId) {
      const row = await this.opts.store.loadSession(sessionId)
      // Also rejects a session id that belongs to a different owner in the same store — e.g. two widget
      // visitors sharing one account must never resume each other's conversation by guessing/observing a session id.
      if (!row || (row.owner ?? null) !== (this.opts.owner ?? null)) {
        const err = new Error("session_not_found")
        err.name = "NasiSessionNotFound"
        throw err
      }
      session = row.session as Session
      events = row.events
      title = row.title
      storedPersona = row.persona
    }
    // The request's pick wins; otherwise a resumed session keeps its persona, one the model switched to included.
    const persona = personas.find(p => p.id === (input.personaId ?? storedPersona)) ?? personas[0]

    const agent = new Agent({
      model: this.opts.chat.model,
      client: this.opts.chat.client,
      tools: this.tools,
      personas,
      personaId: persona?.id,
      instructions: persona?.instructions,
      sampling: samplingOf(persona),
      promptContext: this.opts.promptContext ?? {},
      store: this.opts.store,
      contextWindow: this.opts.chat.contextWindow,
      summarizer: this.opts.summarizer
    })

    return { agent, session, sessionId, events, title }
  }

  /**
   * What the turn feeds the loop. A pending tool approval is answered here, on the server: `approve` runs
   * the call the session saved (never one the client describes), `decline` or a plain message skips it.
   */
  private async promptFor(session: Session, input: NasiTurnInput): Promise<string> {
    const pendingId = session.pendingToolApprovalId
    if (input.approval) {
      if (!pendingId) {
        const err = new Error("nothing_to_approve")
        err.name = "NasiNothingToApprove"
        throw err
      }
      if (input.approval === "decline") {
        recordPausedCall(session, "tool_approval", "declined")
        return TOOL_DECLINED
      }
      const call = pendingToolCall(session, pendingId)
      if (!call) return "Error: the call waiting for approval is gone."
      const startedAt = performance.now()
      let status: "ok" | "error" = "ok"
      const result = await runApprovedTool(this.tools, call.function.name, call.function.arguments, s => {
        status = s
      })
      recordPausedCall(session, "tool_approval", { status, startedAt })
      return result
    }
    const message = input.message ?? ""
    if (pendingId) recordPausedCall(session, "tool_approval", "skipped")
    return pendingId ? `Not run: the user didn't approve it and wrote instead: ${message}` : message
  }

  async turnBuffered(input: NasiTurnInput): Promise<NasiTurnResponse> {
    const gen = this.turn(input)
    let next = await gen.next()
    while (!next.done) next = await gen.next()
    return next.value
  }

  /**
   * Streams one turn live: yields every {@link AgentEvent} as it happens
   * (including `delta` chunks), then returns the same buffered-shaped
   * response `turnBuffered` would have, once the session is persisted.
   */
  turn(input: NasiTurnInput): AsyncGenerator<AgentEvent, NasiTurnResponse, void> {
    return this.turnInner(input)
  }

  /**
   * `/compact`: summarises a stored session now, keeping only its latest turn word for word, and saves it.
   * Undefined when there is nothing to summarise yet. Throws like a turn for a session that isn't this caller's.
   */
  async compact(sessionId: string, focus?: string): Promise<Compaction | undefined> {
    const loaded = await this.loadTurn({ session: sessionId })
    const result = await compact(loaded.agent, loaded.session, focus)
    if (!result) return undefined
    await this.opts.store.updateSession(sessionId, {
      persona: loaded.agent.personaId ?? "default",
      model: loaded.agent.model,
      owner: this.opts.owner ?? null,
      session: loaded.session,
      events: loaded.events
    })
    return result
  }

  private async *turnInner(input: NasiTurnInput): AsyncGenerator<AgentEvent, NasiTurnResponse, void> {
    const loaded = await this.loadTurn(input)
    const prompt = await this.promptFor(loaded.session, input)

    const turnEvents: AgentEvent[] = []
    for await (const event of run(loaded.agent, prompt, loaded.session, this.opts.owner ?? null, input.images)) {
      turnEvents.push(event)
      yield event
    }

    const sessionId = await persistTurn(this.opts, loaded, input, turnEvents)
    return responseFromEvents(sessionId, loaded.session, turnEvents, input.includeThinking === true)
  }
}
