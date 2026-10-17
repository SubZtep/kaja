import { cn } from "@kaja/shared/ui"
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { CaptchaAlert, useTurnstile } from "../../../hooks/turnstile"
import { useUser } from "../../../hooks/user"
import { m } from "../../../paraglide/messages.js"
import { WAYS_IN_ID } from "./channels"
import { GoogleButton } from "./google-button"
import { Sticker } from "./sticker"

// Client-only, code-split: keeps the gif below as the SSR'd LCP element and never
// delays it. Loads after hydration and fades in on top once ready.
const MonsterFace = lazy(() => import("./monster-face").then(mod => ({ default: mod.MonsterFace })))

type DayPart = "morning" | "afternoon" | "evening" | "night"

function dayPart(hour: number): DayPart {
  if (hour < 5) return "night"
  if (hour < 12) return "morning"
  if (hour < 18) return "afternoon"
  return hour < 22 ? "evening" : "night"
}

// Greets in the visitor's local time; the server can't know it, so SSR gets the plain hello.
function greeting(part: DayPart | null, name: string | undefined) {
  if (name) {
    const greet = {
      morning: m.hero_greeting_morning_named,
      afternoon: m.hero_greeting_afternoon_named,
      evening: m.hero_greeting_evening_named,
      night: m.hero_greeting_night_named
    }
    return (part ? greet[part] : m.hero_greeting_named)({ name })
  }
  const greet = {
    morning: m.hero_greeting_morning,
    afternoon: m.hero_greeting_afternoon,
    evening: m.hero_greeting_evening,
    night: m.hero_greeting_night
  }
  return (part ? greet[part] : m.hero_greeting)()
}

// Its own component so the Turnstile check only runs for a visitor who can use the button, not a signed-in user.
function GoogleSignIn() {
  const captcha = useTurnstile()
  return (
    <div>
      <CaptchaAlert captcha={captcha} />
      <GoogleButton label={m.google_start()} captcha={captcha} />
      <a
        href={`#${WAYS_IN_ID}`}
        className="mt-3 inline-block font-stamp text-[11px] text-muted uppercase hover:text-neon"
      >
        {m.hero_run_locally()} ↓
      </a>
    </div>
  )
}

export function Hero() {
  const user = useUser()
  // The animated face follows the mouse, so phones and tablets keep the plain gif and never download it
  const [finePointer, setFinePointer] = useState(false)
  const [faceReady, setFaceReady] = useState(false)
  const onFaceReady = useCallback(() => setFaceReady(true), [])
  const monsterRef = useRef<HTMLDivElement>(null)
  const [part, setPart] = useState<DayPart | null>(null)
  const firstName = user?.name?.trim().split(/\s+/)[0] || undefined

  useEffect(() => {
    setFinePointer(matchMedia("(pointer: fine)").matches)
    setPart(dayPart(new Date().getHours()))
  }, [])

  // While the big monster is on screen, the header's small one steps back (BrandMark styles `data-hero-monster`).
  useEffect(() => {
    const el = monsterRef.current
    if (!el) return
    const root = document.documentElement
    const observer = new IntersectionObserver(([entry]) => {
      root.toggleAttribute("data-hero-monster", Boolean(entry?.isIntersecting))
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      delete root.dataset.heroMonster
    }
  }, [])

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-40 left-[20%] h-140 w-160"
        style={{
          background:
            "radial-gradient(closest-side,color-mix(in srgb, var(--color-neon) 28%, transparent),transparent 70%)"
        }}
      />
      <div
        className="pointer-events-none absolute top-20 right-0 size-100"
        style={{
          background:
            "radial-gradient(closest-side,color-mix(in srgb, var(--color-ice) 16%, transparent),transparent 72%)"
        }}
      />

      {/* Phones stack intro, actions, then the monster; wider screens put intro over actions on the left, the monster on the right */}
      <ContentWidth className="relative grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:grid-rows-[auto_auto] md:gap-8 md:pt-16 md:pb-14 lg:grid-cols-[minmax(0,1fr)_32rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_34rem] xl:gap-x-12">
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <Sticker rotate={-8} className="mb-8">
            {m.hero_badge()}
          </Sticker>

          <h1 className="wrap-normal m-0 max-w-xl font-display font-extrabold text-[34px] text-fg leading-[0.92] tracking-[-0.04em] [word-break:normal] sm:text-[40px] lg:text-[48px] xl:text-[56px]">
            {greeting(part, firstName)}
          </h1>
          <svg className="mt-1 ml-1 w-48 text-neon md:w-72" viewBox="0 0 220 12" fill="none" aria-hidden>
            <path
              d="M1 8 C 40 2, 70 11, 110 6 S 180 2, 219 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <p className="wrap-normal mt-4 mb-0 max-w-md font-display text-lg text-muted [word-break:normal] md:text-xl">
            {m.hero_tagline()}
          </p>
        </div>

        {user ? null : (
          <div className="w-fit min-w-0 md:col-start-1 md:row-start-2">
            <GoogleSignIn />
          </div>
        )}

        <div className="flex min-w-0 flex-col justify-center md:col-start-2 md:row-span-2 md:row-start-1">
          <div ref={monsterRef} className="monster-glint flycursor relative mx-auto w-fit md:w-full">
            <img
              src="/monster.gif"
              alt={m.brand_monster_alt()}
              width={324}
              height={108}
              fetchPriority="high"
              className={cn(
                "h-20 w-auto transition-opacity duration-500 md:h-auto md:w-full",
                faceReady && "opacity-0"
              )}
              style={{ imageRendering: "pixelated" }}
            />
            {finePointer ? (
              <Suspense fallback={null}>
                <MonsterFace className="absolute inset-0" onReady={onFaceReady} />
              </Suspense>
            ) : null}
            <Sticker tone="neon" rotate={-11} className="absolute -bottom-1 -left-3 text-[11px]">
              kaja
            </Sticker>
          </div>
        </div>
      </ContentWidth>
    </section>
  )
}
