import type { NasiTurnResponse } from "@kaja/schema/nasi"
import { useLoaderData } from "@tanstack/react-router"
import { useState } from "react"

const VISITOR_ID_STORAGE_KEY = "kaja-hero-visitor-id"
const ANSWERS = ["Yes", "No", "Sometimes", "Unknown"]

function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_STORAGE_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export function BarkochbaGame() {
  const { apiUrl, widgetKey } = useLoaderData({ from: "__root__" })
  const [phase, setPhase] = useState<"idle" | "playing">("idle")
  const [session, setSession] = useState<string>()
  const [current, setCurrent] = useState("")
  const [aside, setAside] = useState("")
  const [pending, setPending] = useState(false)

  async function sendMessage(message: string) {
    setPending(true)
    try {
      const res = await fetch(`${apiUrl}/widget/turn`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-kaja-widget-key": widgetKey ?? ""
        },
        body: JSON.stringify({ session, message, visitorId: getVisitorId() })
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = (await res.json()) as NasiTurnResponse
      setSession(data.session)
      setCurrent(data.message)
      setAside(
        data.steps
          .filter(step => step.type === "message")
          .map(step => step.content)
          .join(" ")
      )
    } catch {
      setCurrent("Something went wrong. Please try again.")
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
