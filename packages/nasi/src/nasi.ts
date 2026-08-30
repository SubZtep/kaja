import type { Persona } from "@kaja/schema/cli"
import type { NasiStep, NasiTurnRequest, NasiTurnResponse, NasiTurnStatus } from "@kaja/schema/nasi"
import type OpenAI from "openai"
import type { AgentEvent, PromptContext } from "./agent/agent"
import { Agent, createSession, type Session } from "./agent/agent"
import { run } from "./agent/run"
import { createOpenAIClient } from "./models/client"
import { createSessionRow, loadSessionRow, openStore, updateSessionRow, withStorePath } from "./store"
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

function stepsFromEvents(events: AgentEvent[], includeThinking: boolean): NasiStep[] {
  const steps: NasiStep[] = []
  for (const event of events) {
    if (event.type === "delta") continue
    if (event.type === "usage") continue
    if (event.type === "final") continue
    if (event.type === "tool_image" || event.type === "display_image") continue
    if (event.type === "reasoning") {
      if (includeThinking) steps.push({ type: "reasoning", text: event.text })
      continue
    }
    if (event.type === "message") steps.push({ type: "message", content: event.content })
    else if (event.type === "tool_call") steps.push({ type: "tool_call", name: event.name, arguments: event.arguments })
    else if (event.type === "ask_user") steps.push({ type: "ask_user", question: event.question })
    else if (event.type === "persona_switch")
      steps.push({ type: "persona_switch", personaId: event.personaId, label: event.label })
    else if (event.type === "confirm_command")
      steps.push({ type: "confirm_command", command: event.command, description: event.description })
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
    if (ask && ask.type === "ask_user") return ask.question
  }
  const fin = [...events].reverse().find(e => e.type === "final")
  if (fin && fin.type === "final") return fin.content ?? ""
  // Local `?` backstop yields ask_user without pendingAskUserId — still the visible reply.
  const ask = [...events].reverse().find(e => e.type === "ask_user")
  if (ask && ask.type === "ask_user") return ask.question
  const msg = [...events].reverse().find(e => e.type === "message")
  if (msg && msg.type === "message") return msg.content
  return ""
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

  async turnBuffered(input: NasiTurnInput): Promise<NasiTurnResponse> {
    return withStorePath(this.opts.dbPath, async () => {
      const { tools } = await createTools({ profile: this.opts.profile, deps: { chat: this.opts.chat } })
      const personas = this.opts.personas ?? []
      const persona = personas.find(p => p.id === input.personaId) ?? personas[0]

      let sessionId = input.session
      let session = createSession()
      let events: unknown[] = []
      let title = input.message.split(/[\r\n]/)[0]!.slice(0, 60)

      if (sessionId) {
        const row = await loadSessionRow(sessionId)
        if (!row) {
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

      const turnEvents: AgentEvent[] = []
      for await (const event of run(agent, input.message, session, this.opts.owner ?? null)) {
        turnEvents.push(event)
      }

      const includeThinking = input.includeThinking === true
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

      const persistedEvents = [
        ...events,
        { type: "user", text: input.message },
        ...turnEvents.filter(e => e.type !== "delta" && e.type !== "usage")
      ]

      if (!sessionId) {
        sessionId = await createSessionRow({
          persona: persona?.id ?? "default",
          model: agent.model,
          title,
          owner: this.opts.owner ?? null,
          session,
          events: persistedEvents
        })
      } else {
        await updateSessionRow(sessionId, {
          persona: persona?.id ?? "default",
          model: agent.model,
          owner: this.opts.owner ?? null,
          session,
          events: persistedEvents
        })
      }

      return {
        session: sessionId,
        status,
        message,
        steps,
        ...(thinking ? { thinking } : {}),
        ...(usageEvent && usageEvent.type === "usage"
          ? { usage: { promptTokens: usageEvent.promptTokens, model: usageEvent.model } }
          : {})
      }
    })
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
