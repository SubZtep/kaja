import type { Persona } from "@kaja/schema/cli"
import type { NasiStep, NasiTurnRequest, NasiTurnResponse, NasiTurnStatus } from "@kaja/schema/nasi"
import type OpenAI from "openai"
import { Agent, type AgentEvent, createSession, type PromptContext, type Session } from "./agent/agent"
import { samplingOf } from "./agent/persona"
import { run } from "./agent/run"
import type { Tool } from "./agent/tools"
import type { NasiStore } from "./store/types"
import type { NasiToolDeps } from "./tools/deps"
import { createTools } from "./tools/registry"

export type NasiOpenOptions = {
  store: NasiStore
  chat: { client: OpenAI; model: string }
  /** Files, shell, MCP, and plugins. Default false. */
  includeLocalTools?: boolean
  personas?: Persona[]
  promptContext?: PromptContext
  owner?: string | null
  /** Extra tool dependencies merged over `chat` — gates dep-conditional tools (e.g. `fetch_url` needs `fetchProxy`). */
  deps?: Omit<NasiToolDeps, "chat">
}

export type NasiTurnInput = NasiTurnRequest & {
  personaId?: string
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
  if (session.pendingRunCommandId) return "needs_approval"
  return "completed"
}

function messageFromEvents(events: AgentEvent[], status: NasiTurnStatus): string {
  if (status === "needs_input") return lastOf(events, "ask_user")?.question ?? ""
  const fin = lastOf(events, "final")
  if (fin) return fin.content ?? ""
  // Trailing-`?` backstop yields ask_user without pendingAskUserId — still the visible reply.
  return lastOf(events, "ask_user")?.question ?? lastOf(events, "message")?.content ?? ""
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
    { type: "user", text: input.message },
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
    ...(usage ? { usage: { promptTokens: usage.promptTokens, model: usage.model } } : {})
  }
}

export class Nasi {
  readonly opts: NasiOpenOptions
  private readonly tools: Tool<any>[]

  private constructor(opts: NasiOpenOptions, tools: Tool<any>[]) {
    this.opts = opts
    this.tools = tools
  }

  static async open(opts: NasiOpenOptions) {
    const { tools } = await createTools({
      includeLocalTools: opts.includeLocalTools,
      deps: { ...opts.deps, chat: opts.chat }
    })
    return new Nasi(opts, tools)
  }

  private async loadTurn(input: NasiTurnInput): Promise<LoadedTurn> {
    const personas = this.opts.personas ?? []
    const persona = personas.find(p => p.id === input.personaId) ?? personas[0]

    const sessionId = input.session
    let session = createSession()
    let events: unknown[] = []
    let title = input.message.split(/[\r\n]/)[0]!.slice(0, 60)

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
    }

    const agent = new Agent({
      model: this.opts.chat.model,
      client: this.opts.chat.client,
      tools: this.tools,
      personas,
      personaId: persona?.id,
      instructions: persona?.instructions,
      sampling: samplingOf(persona),
      promptContext: this.opts.promptContext ?? {},
      store: this.opts.store
    })

    return { agent, session, sessionId, events, title }
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

  private async *turnInner(input: NasiTurnInput): AsyncGenerator<AgentEvent, NasiTurnResponse, void> {
    const loaded = await this.loadTurn(input)

    const turnEvents: AgentEvent[] = []
    for await (const event of run(loaded.agent, input.message, loaded.session, this.opts.owner ?? null)) {
      turnEvents.push(event)
      yield event
    }

    const sessionId = await persistTurn(this.opts, loaded, input, turnEvents)
    return responseFromEvents(sessionId, loaded.session, turnEvents, input.includeThinking === true)
  }
}
