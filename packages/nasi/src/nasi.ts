import type { Persona } from "@kaja/schema/cli"
import type { NasiStep, NasiTurnRequest, NasiTurnResponse, NasiTurnStatus } from "@kaja/schema/nasi"
import type OpenAI from "openai"
import { Agent, type AgentEvent, createSession, type PromptContext, type Session } from "./agent/agent"
import { run } from "./agent/run"
import { createOpenAIClient } from "./models/client"
import {
  createSessionRow,
  loadSessionRow,
  openStore,
  updateSessionRow,
  withStorePath,
  withStorePathGenerator
} from "./store"
import { createTools, type NasiProfile } from "./tools/registry"

const HOSTED_ENVIRONMENT =
  "You are Kaja hosted chat. You cannot read the user's disk, run a shell, or use MCP. You have memory, web tools, and personas."

export type NasiOpenOptions = {
  dbPath: string
  profile: NasiProfile
  chat: { client: OpenAI; model: string }
  personas?: Persona[]
  promptContext?: PromptContext
  owner?: string | null
}

export type NasiTurnInput = NasiTurnRequest & {
  personaId?: string
}

const SKIPPED_EVENT_TYPES = new Set(["delta", "usage", "final", "tool_image", "display_image"])

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
    if (SKIPPED_EVENT_TYPES.has(event.type)) continue
    const step = stepFromEvent(event, includeThinking)
    if (step) steps.push(step)
  }
  return steps
}

function statusFromEvents(session: Session, events: AgentEvent[]): NasiTurnStatus {
  if (session.pendingAskUserId) return "needs_input"
  if (session.pendingRunCommandId) return "needs_approval"
  const last = [...events].reverse().find(e => e.type === "final" || e.type === "ask_user")
  if (last?.type === "ask_user" && session.pendingAskUserId) return "needs_input"
  return "completed"
}

function messageFromEvents(events: AgentEvent[], status: NasiTurnStatus): string {
  if (status === "needs_input") {
    const ask = [...events].reverse().find(e => e.type === "ask_user")
    if (ask?.type === "ask_user") return ask.question
  }
  const fin = [...events].reverse().find(e => e.type === "final")
  if (fin?.type === "final") return fin.content ?? ""
  // Local `?` backstop yields ask_user without pendingAskUserId — still the visible reply.
  const ask = [...events].reverse().find(e => e.type === "ask_user")
  if (ask?.type === "ask_user") return ask.question
  const msg = [...events].reverse().find(e => e.type === "message")
  if (msg?.type === "message") return msg.content
  return ""
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
  if (!loaded.sessionId) {
    return createSessionRow({ ...row, title: loaded.title })
  }
  await updateSessionRow(loaded.sessionId, row)
  return loaded.sessionId
}

function responseFromEvents(
  sessionId: string,
  session: Session,
  turnEvents: AgentEvent[],
  includeThinking: boolean
): NasiTurnResponse {
  const status = statusFromEvents(session, turnEvents)
  const message = messageFromEvents(turnEvents, status)
  const steps = stepsFromEvents(turnEvents, includeThinking)
  const usageEvent = [...turnEvents].reverse().find(e => e.type === "usage")
  const thinking = includeThinking
    ? turnEvents
        .filter(e => e.type === "reasoning")
        .map(e => (e.type === "reasoning" ? e.text : ""))
        .join("")
    : undefined

  return {
    session: sessionId,
    status,
    message,
    steps,
    ...(thinking ? { thinking } : {}),
    ...(usageEvent?.type === "usage"
      ? { usage: { promptTokens: usageEvent.promptTokens, model: usageEvent.model } }
      : {})
  }
}

export class Nasi {
  readonly opts: NasiOpenOptions

  constructor(opts: NasiOpenOptions) {
    this.opts = opts
    openStore(opts.dbPath)
  }

  static async open(opts: NasiOpenOptions) {
    return new Nasi(opts)
  }

  private async loadTurn(input: NasiTurnInput): Promise<LoadedTurn> {
    const { tools } = await createTools({ profile: this.opts.profile, deps: { chat: this.opts.chat } })
    const personas = this.opts.personas ?? []
    const persona = personas.find(p => p.id === input.personaId) ?? personas[0]

    const sessionId = input.session
    let session = createSession()
    let events: unknown[] = []
    let title = input.message.split(/[\r\n]/)[0]!.slice(0, 60)

    if (sessionId) {
      const row = await loadSessionRow(sessionId)
      // Also rejects a session id that belongs to a different owner within the same dbPath — e.g. two widget
      // visitors sharing one account's SQLite file must never resume each other's conversation by guessing/observing a session id.
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
      tools,
      personas,
      personaId: persona?.id,
      instructions: persona?.instructions,
      promptContext: {
        environment: this.opts.profile === "hosted" ? HOSTED_ENVIRONMENT : this.opts.promptContext?.environment,
        ...this.opts.promptContext
      }
    })

    return { agent, session, sessionId, events, title }
  }

  async turnBuffered(input: NasiTurnInput): Promise<NasiTurnResponse> {
    return withStorePath(this.opts.dbPath, async () => {
      const loaded = await this.loadTurn(input)

      const turnEvents: AgentEvent[] = []
      for await (const event of run(loaded.agent, input.message, loaded.session, this.opts.owner ?? null)) {
        turnEvents.push(event)
      }

      const sessionId = await persistTurn(this.opts, loaded, input, turnEvents)
      return responseFromEvents(sessionId, loaded.session, turnEvents, input.includeThinking === true)
    })
  }

  /**
   * Streams one turn live: yields every {@link AgentEvent} as it happens
   * (including `delta` chunks), then returns the same buffered-shaped
   * response `turnBuffered` would have, once the session is persisted.
   */
  turn(input: NasiTurnInput): AsyncGenerator<AgentEvent, NasiTurnResponse, void> {
    return withStorePathGenerator(this.opts.dbPath, this.turnInner(input))
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

export function clientFromResolved(resolved: { baseUrl: string; apiKey: string | null; model: string }) {
  return {
    client: createOpenAIClient({
      baseURL: resolved.baseUrl,
      apiKey: resolved.apiKey ?? "unused"
    }),
    model: resolved.model
  }
}
