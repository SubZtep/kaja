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
import { useEffect, useRef, useState } from "react"
import type { BarkochbaAction } from "../../../lib/barkochba/game"
import { BARKOCHBA_MAX_QUESTIONS } from "../../../lib/barkochba/rules"
import { type BarkochbaResponse, playBarkochba } from "../../../lib/barkochba/server"
import { cn } from "../../../lib/cn"
import { m } from "../../../paraglide/messages.js"
import { getLocale } from "../../../paraglide/runtime.js"

const getAnswers = () =>
  [
    { label: m.barkochba_answer_yes(), value: "Yes", icon: Check },
    { label: m.barkochba_answer_no(), value: "No", icon: X },
    { label: m.barkochba_answer_sometimes(), value: "Sometimes", icon: EqualApproximately },
    { label: m.barkochba_answer_unknown(), value: "Unknown", icon: CircleHelp }
  ] as const

const getExampleThings = () =>
  [
    { label: m.barkochba_example_pizza(), icon: Pizza },
    { label: m.barkochba_example_guitar(), icon: Guitar },
    { label: m.barkochba_example_rocket(), icon: Rocket },
    { label: m.barkochba_example_dice(), icon: Dices }
  ] as const

const DOT_VARIANTS = {
  won: { colors: ["bg-ice", "bg-ice", "bg-ice"], pulseMs: 1200 },
  thinking: { colors: ["bg-neon", "bg-neon", "bg-neon"], pulseMs: 1000 },
  idle: { colors: ["bg-border", "bg-border", "bg-border"], pulseMs: undefined },
  playing: { colors: ["bg-red-600", "bg-green-600", "bg-blue-600"], pulseMs: undefined }
} as const

type DotVariant = keyof typeof DOT_VARIANTS

function dotVariantFor(phase: BarkochbaResponse["phase"], pending: boolean): DotVariant {
  if (phase === "won") return "won"
  if (pending) return "thinking"
  return phase === "idle" ? "idle" : "playing"
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

const IDLE_VIEW: BarkochbaResponse = {
  ready: true,
  phase: "idle",
  question: "",
  questionCount: 0,
  pendingGuess: false,
  source: null
}

function errorText(code: BarkochbaResponse["error"]): string {
  if (code === "rate") return m.barkochba_error_rate_limited()
  if (code) return m.barkochba_error_generic()
  return ""
}

/** The homepage Barkochba board. The browser never holds a widget token; the server action does. */
export function BarkochbaGame({ className }: Readonly<{ className?: string }>) {
  const { barkochbaReady } = useLoaderData({ from: "__root__" })
  const frame = useRef<HTMLIFrameElement>(null)
  const [view, setView] = useState<BarkochbaResponse>(IDLE_VIEW)
  const [pending, setPending] = useState(false)
  // The source the iframe has loaded; until then (or after a new publish) the shell shows the question itself
  const [loadedSource, setLoadedSource] = useState<string | null>(null)
  const frameReady = Boolean(view.source) && loadedSource === view.source

  useEffect(() => {
    if (!barkochbaReady) return
    let cancelled = false
    void playBarkochba({ data: { type: "sync" } })
      .then(next => {
        if (!cancelled) setView(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [barkochbaReady])

  useEffect(() => {
    const target = frame.current?.contentWindow
    if (!target || !frameReady) return
    target.postMessage(
      {
        type: "state",
        phase: view.phase,
        question: view.question,
        aside: "",
        questionCount: view.questionCount,
        maxQuestions: BARKOCHBA_MAX_QUESTIONS,
        answers: getAnswers().map(({ value, label }) => ({ value, label }))
      },
      "*"
    )
  }, [view, frameReady])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // A sandboxed iframe without allow-same-origin posts from the opaque origin "null"
      if (event.origin !== "null" || event.source !== frame.current?.contentWindow) return
      const data = event.data as { type?: string; value?: string }
      if (
        data?.type === "answer" &&
        (data.value === "Yes" || data.value === "No" || data.value === "Sometimes" || data.value === "Unknown")
      )
        void act({ type: "answer", value: data.value, locale: getLocale() })
      if (data?.type === "start") void act({ type: "start", locale: getLocale() })
      if (data?.type === "giveup") void act({ type: "giveup" })
      if (data?.type === "restart") void act({ type: "restart" })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  })

  async function act(data: BarkochbaAction) {
    if (!barkochbaReady) return
    setPending(true)
    try {
      setView(await playBarkochba({ data }))
    } catch {
      setView(current => ({ ...current, error: "play" }))
    } finally {
      setPending(false)
    }
  }

  const phase = view.phase
  const shown = view.error ? errorText(view.error) : view.question
  const won = phase === "won"
  const showFrame = frameReady && !pending && !view.error

  return (
    <div
      className={cn(
        "border-border bg-surface-2 overflow-hidden rounded-xl border shadow-[0_24px_60px_-20px_#000a]",
        className
      )}
    >
      <div className="border-border bg-surface flex items-center gap-2 border-b px-3.5 py-2.5">
        <TitleBarDots variant={dotVariantFor(phase, pending)} />
        <span className="text-muted ml-1.5 font-mono text-xs">{m.barkochba_title_bar()}</span>
      </div>
      <div className="flex min-h-65 flex-col justify-between p-5 font-mono text-[13.5px] leading-[1.9]">
        {phase === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <p className="text-muted">{m.barkochba_idle_prompt({ maxQuestions: BARKOCHBA_MAX_QUESTIONS })}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {getExampleThings().map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="border-border bg-surface text-muted flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
              <span className="text-muted text-xs">{m.barkochba_example_or_anything()}</span>
            </div>
            <button
              type="button"
              onClick={() => act({ type: "start", locale: getLocale() })}
              className="border-neon bg-neon/10 text-neon cursor-pointer rounded-md border px-5 py-2 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.02] active:translate-y-0"
            >
              {m.barkochba_start()}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-center gap-1">
              {Array.from({ length: BARKOCHBA_MAX_QUESTIONS }, (_, i) => (
                <span
                  key={`q-${i + 1}`}
                  className={`size-1.5 rounded-full ${i < view.questionCount ? "bg-neon" : "bg-border"}`}
                />
              ))}
            </div>
            {view.source ? (
              <iframe
                ref={frame}
                title={m.barkochba_title_bar()}
                sandbox="allow-scripts"
                srcDoc={view.source}
                onLoad={() => setLoadedSource(view.source)}
                className={cn("h-24 w-full border-0", !showFrame && "hidden")}
              />
            ) : null}
            <div
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1.5 text-center",
                showFrame && "hidden"
              )}
            >
              {pending ? (
                <span className="text-muted flex items-center gap-1">
                  <BrainCircuit size={18} /> {m.barkochba_thinking()}
                </span>
              ) : (
                <>
                  {won ? <Sparkles className="text-ice size-5" /> : <Wand className="text-neon size-5" />}
                  <span className="text-fg">{shown}</span>
                </>
              )}
            </div>
            {won || phase === "lost" ? (
              <button
                type="button"
                onClick={() => act({ type: "restart" })}
                className="border-neon bg-neon/10 text-neon mt-4 cursor-pointer self-center rounded-md border px-5 py-2 text-sm font-semibold"
              >
                {m.barkochba_play_again()}
              </button>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {getAnswers().map(({ label, value, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={pending}
                      onClick={() => act({ type: "answer", value, locale: getLocale() })}
                      className="border-border bg-surface text-fg hover:border-neon/60 hover:bg-neon/10 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="size-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => act({ type: "giveup" })}
                  className="text-muted hover:text-fg mt-3 cursor-pointer self-center text-xs underline underline-offset-2 transition-colors duration-200 hover:underline-offset-0"
                >
                  {m.barkochba_give_up()}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
