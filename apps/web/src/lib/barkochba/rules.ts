import type { WidgetMe } from "@kaja/schema/api"

export const BARKOCHBA_ANSWERS = ["Yes", "No", "Sometimes", "Unknown"] as const
export const BARKOCHBA_MAX_QUESTIONS = 20

type BarkochbaAnswer = (typeof BARKOCHBA_ANSWERS)[number]

export type GameState = {
  phase: "idle" | "playing" | "won" | "lost"
  history: { role: "user" | "assistant"; content: string }[]
  question: string
  questionCount: number
  pendingGuess: boolean
}

export type PlayRequest = { history: GameState["history"]; locale: string; maxQuestions: number }
export type PlayResult = { type: "question" | "guess" | "giveup"; text: string }
export type Play = (request: PlayRequest) => Promise<PlayResult>

export const IDLE_GAME: GameState = {
  phase: "idle",
  history: [],
  question: "",
  questionCount: 0,
  pendingGuess: false
}

export class GameRuleError extends Error {}

/** The homepage pair is a browser board linked to a server player. */
export function homepagePairProblem(board: WidgetMe, player: WidgetMe): string | undefined {
  if (board.target.kind !== "browser" || board.target.page !== "home") return "The board is not the homepage widget"
  if (player.target.kind !== "server") return "The player is not a server widget"
  if (!board.links.includes(player.id)) return "The board is not linked to the player"
  return undefined
}

function asked(history: GameState["history"], result: PlayResult, questionCount: number): GameState {
  if (result.type === "giveup")
    return { phase: "lost", history, question: result.text, questionCount, pendingGuess: false }
  return {
    phase: "playing",
    history: [...history, { role: "assistant", content: result.text }],
    question: result.text,
    questionCount,
    pendingGuess: result.type === "guess"
  }
}

/** Applies one visitor action. The player runs only when the rules allow another question. */
export async function stepGame(
  state: GameState,
  action:
    | { type: "start"; locale: string }
    | { type: "answer"; value: string; locale: string }
    | { type: "giveup" }
    | { type: "restart" },
  play: Play
): Promise<GameState> {
  if (action.type === "restart") return IDLE_GAME
  if (action.type === "giveup") {
    if (state.phase !== "playing") throw new GameRuleError("not playing")
    return { ...state, phase: "lost" }
  }
  if (action.type === "start") {
    if (state.phase === "playing") throw new GameRuleError("already playing")
    const history = [{ role: "user" as const, content: "Let's play." }]
    return asked(history, await play({ history, locale: action.locale, maxQuestions: BARKOCHBA_MAX_QUESTIONS }), 1)
  }
  if (state.phase !== "playing") throw new GameRuleError("not playing")
  if (!BARKOCHBA_ANSWERS.includes(action.value as BarkochbaAnswer)) throw new GameRuleError("bad answer")
  const history = [...state.history, { role: "user" as const, content: action.value }]
  if (state.pendingGuess && action.value === "Yes") return { ...state, phase: "won", history }
  if (state.questionCount >= BARKOCHBA_MAX_QUESTIONS) return { ...state, phase: "lost", history }
  const result = await play({ history, locale: action.locale, maxQuestions: BARKOCHBA_MAX_QUESTIONS })
  return asked(history, result, state.questionCount + 1)
}
