import { createVisitorId, sendWidgetTurn } from "@kaja/widget/client"
import { useLoaderData } from "@tanstack/react-router"
import {
  BrainCircuit,
  Check,
  CircleHelp,
  Dices,
  EqualApproximately,
  Guitar,
  Pizza,
  Rocket,
  Sparkles,
  Wand,
  X
} from "lucide-react"
import { useEffect, useState } from "react"

const ANSWERS = [
  { label: "Yes", icon: Check },
  { label: "No", icon: X },
  { label: "Sometimes", icon: EqualApproximately },
  { label: "Unknown", icon: CircleHelp }
] as const

const EXAMPLE_THINGS = [
  { label: "Pizza", icon: Pizza },
  { label: "Guitar", icon: Guitar },
  { label: "Rocket", icon: Rocket },
  { label: "Dice", icon: Dices }
] as const

const MAX_QUESTIONS = 20
const STATE_STORAGE_KEY = "kaja-barkochba-state"

const DOT_VARIANTS = {
  won: { colors: ["bg-ice", "bg-ice", "bg-ice"], pulseMs: 1200 },
  thinking: { colors: ["bg-neon", "bg-neon", "bg-neon"], pulseMs: 1000 },
  idle: { colors: ["bg-border", "bg-border", "bg-border"], pulseMs: undefined },
  playing: { colors: ["bg-red-600", "bg-green-600", "bg-blue-600"], pulseMs: undefined }
} as const

type DotVariant = keyof typeof DOT_VARIANTS

function dotVariantFor(won: boolean, pending: boolean, phase: GameState["phase"]): DotVariant {
  if (won) return "won"
  if (pending) return "thinking"
  return phase === "idle" ? "idle" : "playing"
}

type GameState = {
  phase: "idle" | "playing"
  visitorId?: string
  session?: string
  current: string
  aside: string
  questionCount: number
  won: boolean
}

const IDLE_STATE: GameState = {
  phase: "idle",
  visitorId: undefined,
  session: undefined,
  current: "",
  aside: "",
  questionCount: 0,
  won: false
}

function loadState(): GameState {
  try {
    const raw = sessionStorage.getItem(STATE_STORAGE_KEY)
    if (!raw) return IDLE_STATE
    return { ...IDLE_STATE, ...JSON.parse(raw) }
  } catch {
    return IDLE_STATE
  }
}

function saveState(state: GameState) {
  try {
    sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

/**
 * Removes an exact (case-insensitive) occurrence of `question` from `content` — a plain substring
 * match, so it works for any language — then drops a short trailing label left behind by a
 * removal (e.g. "Question 2:"), identified purely by length/punctuation, not vocabulary.
 */
function withoutQuestion(content: string, question: string): string {
  if (!question) return content.trim()
  const index = content.toLowerCase().indexOf(question.toLowerCase())
  const withoutMatch = index === -1 ? content : content.slice(0, index) + content.slice(index + question.length)
  const collapsed = withoutMatch.replace(/\s+/g, " ").trim()
  return collapsed.replace(/(?:^|[.!?]\s+)\S{1,20}(?:\s\S{1,20}){0,2}:$/u, "").trim()
}

function StatusIcon({ won, aside }: Readonly<{ won: boolean; aside: string }>) {
  if (won) return <Sparkles className="size-5 text-ice" />
  if (aside) return <span className="text-muted text-xs italic">{aside}</span>
  return <Wand className="size-5 text-neon" />
}

const DOT_POSITIONS = ["first", "second", "third"] as const

function TitleBarDots({ variant }: Readonly<{ variant: DotVariant }>) {
  const { colors, pulseMs } = DOT_VARIANTS[variant]
  return (
    <>
      {DOT_POSITIONS.map((position, i) => (
        <span
          key={position}
          className={`size-2.5 rounded-full ${colors[i]} ${pulseMs ? "animate-[dot-pulse_ease-in-out_infinite]" : ""}`}
          style={pulseMs ? { animationDuration: `${pulseMs}ms`, animationDelay: `${i * 150}ms` } : undefined}
        />
      ))}
    </>
  )
}

export function BarkochbaGame() {
  const { apiUrl, barkochbaWidgetKey } = useLoaderData({ from: "__root__" })
  const [phase, setPhase] = useState<GameState["phase"]>(IDLE_STATE.phase)
  const [visitorId] = useState(() => loadState().visitorId ?? createVisitorId())
  const [session, setSession] = useState<string | undefined>(IDLE_STATE.session)
  const [current, setCurrent] = useState(IDLE_STATE.current)
  const [aside, setAside] = useState(IDLE_STATE.aside)
  const [questionCount, setQuestionCount] = useState(IDLE_STATE.questionCount)
  const [won, setWon] = useState(IDLE_STATE.won)
  const [pending, setPending] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Resume from sessionStorage only after mount — reading it during the initial
  // render would desync from the server-rendered idle markup and trigger a hydration error.
  useEffect(() => {
    const stored = loadState()
    setPhase(stored.phase)
    setSession(stored.session)
    setCurrent(stored.current)
    setAside(stored.aside)
    setQuestionCount(stored.questionCount)
    setWon(stored.won)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveState({ phase, visitorId, session, current, aside, questionCount, won })
  }, [hydrated, phase, visitorId, session, current, aside, questionCount, won])

  async function sendMessage(message: string) {
    setPending(true)
    try {
      const data = await sendWidgetTurn(apiUrl, barkochbaWidgetKey ?? "", { session, message, visitorId })
      setSession(data.session)
      setCurrent(data.message)
      const askStep = data.steps.find(step => step.type === "ask_user")
      if (askStep) setQuestionCount(count => count + 1)
      setWon(!askStep && data.status === "completed")
      const note = askStep?.type === "ask_user" ? askStep.note : undefined
      const messageStep = data.steps.find(step => step.type === "message")
      const fallback = messageStep?.type === "message" ? withoutQuestion(messageStep.content, data.message) : ""
      setAside(note ?? fallback)
    } catch (error) {
      setCurrent(error instanceof Error ? error.message : "Something went wrong. Please try again.")
      setAside("")
    } finally {
      setPending(false)
    }
  }

  function start() {
    setPhase("playing")
    setCurrent("")
    setAside("")
    setSession(undefined)
    setQuestionCount(0)
    setWon(false)
    void sendMessage("Let's play!")
  }

  function playAgain() {
    setPhase("idle")
    setCurrent("")
    setAside("")
    setSession(undefined)
    setQuestionCount(0)
    setWon(false)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2 shadow-[0_24px_60px_-20px_#000a]">
      <div className="flex items-center gap-2 border-border border-b bg-surface px-3.5 py-2.5">
        <TitleBarDots variant={dotVariantFor(won, pending, phase)} />
        <span className="ml-1.5 font-mono text-muted text-xs">AI widget: barkochba game</span>
      </div>

      <div className="flex min-h-65 flex-col justify-between p-5 font-mono text-[13.5px] leading-[1.9]">
        {phase === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <p className="text-muted">
              Think of something. You get {MAX_QUESTIONS} questions — answer by clicking a button below.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {EXAMPLE_THINGS.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-muted text-xs"
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
              <span className="text-muted text-xs">&hellip;or anything else</span>
            </div>
            <button
              type="button"
              onClick={start}
              className="cursor-pointer rounded-md border border-neon bg-neon/10 px-5 py-2 font-semibold text-neon text-sm transition-transform duration-200 motion-safe:animate-pulse hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0"
            >
              Start
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-center gap-1">
              {Array.from({ length: MAX_QUESTIONS }, (_, i) => (
                <span
                  key={`q-${i + 1}`}
                  className={`size-1.5 rounded-full ${i < questionCount ? "bg-neon" : "bg-border"}`}
                />
              ))}
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
              {pending ? (
                <span className="text-muted flex items-center gap-1">
                  <BrainCircuit size={18} /> thinking&hellip;
                </span>
              ) : (
                <>
                  <StatusIcon won={won} aside={aside} />
                  <span className="text-fg">{current}</span>
                </>
              )}
            </div>
            {won ? (
              <button
                type="button"
                onClick={playAgain}
                className="mt-4 cursor-pointer self-center rounded-md border border-neon bg-neon/10 px-5 py-2 font-semibold text-neon text-sm"
              >
                Play again
              </button>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {ANSWERS.map(({ label, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={pending}
                      onClick={() => sendMessage(label)}
                      className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-fg text-sm transition-colors hover:border-neon/60 hover:bg-neon/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={playAgain}
                  className="mt-3 cursor-pointer self-center text-muted text-xs underline underline-offset-2 transition-colors duration-200 hover:underline-offset-0 hover:text-fg"
                >
                  Give up
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
