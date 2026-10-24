import type { AiChatMessage, WidgetMe } from "@kaja/schema/api"
import { widgetMeSchema, widgetSourceResponseSchema } from "@kaja/schema/api"
import { z } from "zod"
import { runPlayer } from "./player"
import { BARKOCHBA_ANSWERS, GameRuleError, type GameState, homepagePairProblem, IDLE_GAME, stepGame } from "./rules"

const stateSchema = z.object({
  phase: z.enum(["idle", "playing", "won", "lost"]),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(80),
  question: z.string(),
  questionCount: z.number().int().min(0).max(20),
  pendingGuess: z.boolean()
})

export const barkochbaActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sync") }),
  z.object({ type: z.literal("start"), locale: z.string().max(35) }),
  z.object({ type: z.literal("answer"), value: z.enum(BARKOCHBA_ANSWERS), locale: z.string().max(35) }),
  z.object({ type: z.literal("giveup") }),
  z.object({ type: z.literal("restart") })
])

export type BarkochbaAction = z.infer<typeof barkochbaActionSchema>

export type BarkochbaResponse = {
  ready: boolean
  phase: GameState["phase"]
  question: string
  questionCount: number
  pendingGuess: boolean
  source: string | null
  error?: "rate" | "unavailable" | "rule" | "play"
}

/** What one game action needs from the web server: the two tokens, the visitor, and a way to call the API. */
export type BarkochbaHost = {
  boardToken?: string
  playerToken?: string
  /** The visitor's id; `create` mints one (a cookie) when there is none, else undefined. */
  visitorId: (create: boolean) => string | undefined
  api: (token: string, path: string, init?: RequestInit) => Promise<Response>
  runPlayer?: typeof runPlayer
  /** A failed play the visitor only sees as a generic error. */
  report?: (error: unknown) => void
}

const UNAVAILABLE: BarkochbaResponse = {
  ready: false,
  phase: "idle",
  question: "",
  questionCount: 0,
  pendingGuess: false,
  source: null
}

const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX = 30
const hits = new Map<string, number[]>()
const tails = new Map<string, Promise<unknown>>()
// Published source never changes under one generation id
const sourceCache = new Map<string, string>()

function limited(visitorId: string): boolean {
  const now = Date.now()
  const recent = (hits.get(visitorId) ?? []).filter(at => now - at < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) return true
  recent.push(now)
  hits.set(visitorId, recent)
  return false
}

// One action per visitor at a time, so two tabs can't both spend a question
function oneAtATime<T>(visitorId: string, run: () => Promise<T>): Promise<T> {
  const current = (tails.get(visitorId) ?? Promise.resolve()).then(run, run)
  const tail = current.then(
    () => undefined,
    () => undefined
  )
  tails.set(visitorId, tail)
  void tail.then(() => {
    if (tails.get(visitorId) === tail) tails.delete(visitorId)
  })
  return current
}

function viewOf(state: GameState, source: string | null, error?: BarkochbaResponse["error"]): BarkochbaResponse {
  return {
    ready: true,
    phase: state.phase,
    question: state.question,
    questionCount: state.questionCount,
    pendingGuess: state.pendingGuess,
    source,
    ...(error ? { error } : {})
  }
}

async function describe(host: BarkochbaHost, token: string): Promise<WidgetMe | null> {
  const res = await host.api(token, "/widget/me")
  if (!res.ok) return null
  const parsed = widgetMeSchema.safeParse(await res.json())
  return parsed.success ? parsed.data : null
}

async function publishedSource(host: BarkochbaHost, token: string, widget: WidgetMe): Promise<string | null> {
  const generationId = widget.publishedGenerationId
  if (!generationId) return null
  const cached = sourceCache.get(generationId)
  if (cached !== undefined) return cached
  const res = await host.api(token, "/widget/source")
  if (!res.ok) return null
  const parsed = widgetSourceResponseSchema.safeParse(await res.json())
  if (!parsed.success) return null
  sourceCache.set(parsed.data.generationId, parsed.data.source)
  return parsed.data.source
}

async function loadState(host: BarkochbaHost, token: string, visitorId: string): Promise<GameState> {
  const res = await host.api(token, `/widget/state/${visitorId}`)
  if (!res.ok) return IDLE_GAME
  const body = (await res.json()) as { state?: unknown }
  const parsed = stateSchema.safeParse(body.state)
  return parsed.success ? parsed.data : IDLE_GAME
}

/**
 * Applies one homepage game action as the board, with the player asking. The response carries no token, and neither
 * widget is called for a model unless both tokens resolve to the linked homepage pair.
 */
export async function handleBarkochba(action: BarkochbaAction, host: BarkochbaHost): Promise<BarkochbaResponse> {
  const { boardToken, playerToken } = host
  if (!boardToken || !playerToken) return UNAVAILABLE
  const visitorId = host.visitorId(action.type !== "sync")
  // A visitor who never played has nothing to resume
  if (!visitorId) return viewOf(IDLE_GAME, null)
  if (action.type !== "sync" && limited(visitorId)) return viewOf(IDLE_GAME, null, "rate")

  return oneAtATime(visitorId, async () => {
    const [board, player] = await Promise.all([describe(host, boardToken), describe(host, playerToken)])
    if (!board || !player || homepagePairProblem(board, player)) return viewOf(IDLE_GAME, null, "unavailable")

    const [source, state] = await Promise.all([
      publishedSource(host, boardToken, board),
      loadState(host, boardToken, visitorId)
    ])
    if (action.type === "sync") return viewOf(state, source)

    const run = host.runPlayer ?? runPlayer
    let next: GameState
    try {
      next = await stepGame(state, action, async request => {
        const playerSource = await publishedSource(host, playerToken, player)
        if (!playerSource) throw new Error("the player is not published")
        return run(playerSource, request, async messages => {
          const res = await host.api(playerToken, "/ai/chat", {
            method: "POST",
            body: JSON.stringify({ messages: messages satisfies AiChatMessage[] })
          })
          if (!res.ok) throw new Error(`chat failed: ${res.status}`)
          return ((await res.json()) as { message: string }).message
        })
      })
    } catch (error) {
      if (!(error instanceof GameRuleError)) host.report?.(error)
      return viewOf(state, source, error instanceof GameRuleError ? "rule" : "play")
    }
    const saved = await host.api(boardToken, `/widget/state/${visitorId}`, {
      method: "PUT",
      body: JSON.stringify({ state: next })
    })
    if (!saved.ok) return viewOf(state, source, "play")
    return viewOf(next, source)
  })
}
