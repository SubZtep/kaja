import { createVisitorId, sendWidgetTurn } from "@kaja/widget/client"
import { useLoaderData } from "@tanstack/react-router"
import { useEffect, useState } from "react"

const ANSWERS = ["Yes", "No", "Sometimes", "Unknown"]
const STATE_STORAGE_KEY = "kaja-barkochba-state"

type GameState = {
  phase: "idle" | "playing"
  visitorId?: string
  session?: string
  current: string
  aside: string
}

const IDLE_STATE: GameState = { phase: "idle", visitorId: undefined, session: undefined, current: "", aside: "" }

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

export function BarkochbaGame() {
  const { apiUrl, widgetKey } = useLoaderData({ from: "__root__" })
  const [phase, setPhase] = useState<GameState["phase"]>(IDLE_STATE.phase)
  const [visitorId] = useState(() => loadState().visitorId ?? createVisitorId())
  const [session, setSession] = useState<string | undefined>(IDLE_STATE.session)
  const [current, setCurrent] = useState(IDLE_STATE.current)
  const [aside, setAside] = useState(IDLE_STATE.aside)
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
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveState({ phase, visitorId, session, current, aside })
  }, [hydrated, phase, visitorId, session, current, aside])

  async function sendMessage(message: string) {
    setPending(true)
    try {
      const data = await sendWidgetTurn(apiUrl, widgetKey ?? "", { session, message, visitorId })
      setSession(data.session)
      setCurrent(data.message)
      const askStep = data.steps.find(step => step.type === "ask_user")
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
    void sendMessage("Let's play!")
  }

  function playAgain() {
    setPhase("idle")
    setCurrent("")
    setAside("")
    setSession(undefined)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2 shadow-[0_24px_60px_-20px_#000a]">
      <div className="flex items-center gap-2 border-border border-b bg-surface px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f56]" />
        <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
        <span className="size-2.5 rounded-full bg-[#27c93f]" />
        <span className="ml-1.5 font-mono text-muted text-xs">barkochba</span>
      </div>

      <div className="flex min-h-65 flex-col justify-between p-5 font-mono text-[13.5px] leading-[1.9]">
        {phase === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted">Think of a thing. Kaja will ask up to 20 yes/no questions to guess it.</p>
            <button
              type="button"
              onClick={start}
              className="cursor-pointer rounded-md border border-neon bg-neon/10 px-5 py-2 font-semibold text-neon text-sm"
            >
              Start
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col justify-center gap-1.5">
              {pending ? (
                <span className="text-muted">⋮ thinking&hellip;</span>
              ) : (
                <>
                  {aside && <span className="text-muted text-xs italic">{aside}</span>}
                  <span className="text-fg">{current}</span>
                </>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {ANSWERS.map(answer => (
                <button
                  key={answer}
                  type="button"
                  disabled={pending}
                  onClick={() => sendMessage(answer)}
                  className="cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-fg text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {answer}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={playAgain}
              className="mt-3 self-center text-muted text-xs underline underline-offset-2"
            >
              Play again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
