import { cn } from "@kaja/shared/ui"
import { Link } from "@tanstack/react-router"
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { Turnstile, useTurnstile } from "../../../hooks/turnstile"
import { useUser } from "../../../hooks/user"
import { detectInstallOs, INSTALL_CMD, type InstallOs } from "../../../lib/vars"
import { m } from "../../../paraglide/messages.js"
import { GoogleButton } from "./google-button"
import { Showcase } from "./showcase"
import { Sticker } from "./sticker"
import { TelegramConnectCta, TelegramPromo } from "./telegram-connect-cta"

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

export function Hero() {
  const user = useUser()
  const captcha = useTurnstile()
  const [copied, setCopied] = useState(false)
  // The animated face follows the mouse, so phones and tablets keep the plain gif and never download it
  const [finePointer, setFinePointer] = useState(false)
  const [faceReady, setFaceReady] = useState(false)
  const onFaceReady = useCallback(() => setFaceReady(true), [])
  const monsterRef = useRef<HTMLDivElement>(null)
  const [os, setOs] = useState<InstallOs>("unix")
  const installCmd = INSTALL_CMD[os]
  const [part, setPart] = useState<DayPart | null>(null)
  const firstName = user?.name?.trim().split(/\s+/)[0] || undefined

  useEffect(() => {
    setOs(detectInstallOs())
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

  const copyInstall = () => {
    navigator.clipboard?.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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

      {/* Phones stack intro, monster and toys, then the actions; wider screens put intro over actions on the left, and the extra height of the right column goes below the actions */}
      <ContentWidth className="relative grid gap-12 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:grid-rows-[auto_1fr] md:gap-8 md:pt-16 md:pb-14 lg:grid-cols-[minmax(0,1fr)_32rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_34rem] xl:gap-x-12">
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          <Sticker rotate={-8} className="mb-8">
            {m.hero_badge()}
          </Sticker>

          <h1 className="m-0 max-w-xl font-display font-extrabold text-fg text-[34px] leading-[0.92] tracking-[-0.04em] wrap-normal [word-break:normal] sm:text-[40px] lg:text-[48px] xl:text-[56px]">
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

          <p className="mt-4 mb-0 max-w-md font-display text-lg text-muted wrap-normal [word-break:normal] md:text-xl">
            {m.hero_subline()}
          </p>
        </div>

        <div className="order-last min-w-0 md:order-0 md:col-start-1 md:row-start-2 *:first:mt-0">
          {user ? null : (
            <div className="mt-8 max-w-md flex flex-col gap-4">
              <Turnstile captcha={captcha} />
              <GoogleButton captcha={captcha} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-crt text-base">
                <Link to="/signin" className="text-fg hover:text-neon">
                  {m.nav_sign_in()}
                </Link>
                <span className="text-border">/</span>
                <Link to="/signup" className="text-fg hover:text-neon">
                  {m.nav_sign_up()}
                </Link>
                {/* On phones the source link takes its own line, so no slash is left dangling */}
                <span className="hidden text-border sm:inline">/</span>
                <a
                  href="https://github.com/SubZtep/kaja"
                  target="_blank"
                  rel="noopener"
                  className="basis-full text-muted sm:basis-auto"
                >
                  {m.hero_cta_source()}
                </a>
              </div>
            </div>
          )}

          <div className="mt-10 max-w-xl">{user ? <TelegramConnectCta /> : <TelegramPromo />}</div>

          <div className="relative mt-8 max-w-xl">
            <fieldset className="mb-2 flex gap-1" aria-label={m.install_title()}>
              {(["unix", "windows"] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={os === key}
                  onClick={() => {
                    setOs(key)
                    setCopied(false)
                  }}
                  className={cn(
                    "cursor-pointer border px-2 py-1 font-stamp text-[11px] uppercase",
                    os === key ? "border-ice bg-ice text-bg" : "border-transparent text-muted hover:text-ice"
                  )}
                >
                  {key === "unix" ? m.install_mac_linux_label() : m.install_windows_label()}
                </button>
              ))}
            </fieldset>
            <Sticker rotate={8} className="absolute -top-1 right-2 z-1 text-[10px]">
              {m.install_linux_note()}
            </Sticker>
            <div className="crt-frame flex max-w-xl min-w-0 items-start gap-2.5 px-3 py-2.5 sm:items-center sm:px-3.5">
              <code className="min-w-0 flex-1 wrap-break-word font-crt text-neon text-sm sm:overflow-x-auto sm:whitespace-nowrap">
                {installCmd}
                <span className="ml-0.5 inline-block h-3.5 w-1.5 bg-neon align-[-1px] animate-[caret-blink_1.1s_steps(1)_infinite]" />
              </code>
              <button
                type="button"
                onClick={copyInstall}
                className="shrink-0 cursor-pointer border border-ice/70 bg-surface px-2 py-1 font-crt text-[11px] text-ice uppercase"
              >
                {copied ? m.hero_copy_copied() : m.hero_copy_copy()}
              </button>
            </div>
            <p className="mt-3 mb-0 font-crt text-muted text-sm">
              {m.install_binary_prefix()}{" "}
              <a
                href="https://github.com/SubZtep/kaja/releases"
                target="_blank"
                rel="noopener"
                className="text-neon underline underline-offset-2"
              >
                {m.install_binary_link()}
              </a>
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-8 md:col-start-2 md:row-span-2 md:row-start-1">
          <div ref={monsterRef} className="monster-glint relative mx-auto w-fit md:w-full">
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

          <Showcase />
        </div>
      </ContentWidth>
    </section>
  )
}
