import { Link, useLoaderData } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { useUser } from "../../../hooks/user"
import { getInstallCmd } from "../../../lib/vars"
import { m } from "../../../paraglide/messages.js"
import { GoogleSoonButton } from "./google-soon-button"
import { Sticker } from "./sticker"
import { TelegramConnectCta, TelegramPromo } from "./telegram-connect-cta"

export function Hero() {
  const { apiUrl, chatWidgetKey } = useLoaderData({ from: "__root__" })
  const user = useUser()
  const [copied, setCopied] = useState(false)
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/install.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  // Embeds the standalone chat widget bubble so the carousel "Chat" tile has somewhere to go.
  useEffect(() => {
    if (!chatWidgetKey) return
    const script = document.createElement("script")
    script.async = true
    script.src = `${apiUrl}/widget/${chatWidgetKey}.js`
    document.body.appendChild(script)
    return () => {
      script.remove()
    }
  }, [apiUrl, chatWidgetKey])

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
        className="pointer-events-none absolute top-20 right-0 h-100 w-100"
        style={{
          background:
            "radial-gradient(closest-side,color-mix(in srgb, var(--color-ice) 16%, transparent),transparent 72%)"
        }}
      />

      <ContentWidth className="relative py-10 md:pt-16 md:pb-8">
        <Sticker rotate={-8} className="mb-8">
          {m.hero_badge()}
        </Sticker>

        <div className="relative md:pr-52 lg:pr-72">
          <h1 className="m-0 max-w-3xl font-display font-extrabold text-fg text-[40px] leading-[0.92] tracking-[-0.04em] md:text-[72px]">
            {m.hero_headline()}
          </h1>
          <svg className="mt-1 ml-1 w-48 text-neon md:w-72" viewBox="0 0 220 12" fill="none" aria-hidden>
            <path
              d="M1 8 C 40 2, 70 11, 110 6 S 180 2, 219 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <p className="mt-4 mb-0 max-w-md font-display text-lg text-muted [overflow-wrap:normal] [word-break:normal] md:text-xl">
            {m.hero_subline()}
          </p>

          <div className="pointer-events-none absolute -right-2 -top-6 hidden md:flex flex-col items-center gap-5 lg:-right-8 lg:-top-10">
            <div className="monster-glint relative">
              <img
                src="/monster.gif"
                alt={m.brand_monster_alt()}
                className="h-36 w-auto lg:h-48"
                style={{ imageRendering: "pixelated" }}
              />
              <Sticker tone="neon" rotate={-11} className="absolute -bottom-1 -left-3 text-[11px]">
                kaja
              </Sticker>
            </div>
            <div className="pointer-events-auto w-64">{user ? <TelegramConnectCta /> : <TelegramPromo />}</div>
          </div>
        </div>

        {user ? null : (
          <div className="mt-8 max-w-md flex flex-col gap-4">
            <GoogleSoonButton />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-crt text-base">
              <Link to="/signin" className="text-fg hover:text-neon">
                {m.nav_sign_in()}
              </Link>
              <span className="text-border">/</span>
              <Link to="/signup" className="text-fg hover:text-neon">
                {m.nav_sign_up()}
              </Link>
              <span className="text-border">/</span>
              <a href="https://github.com/SubZtep/kaja" target="_blank" rel="noopener" className="text-muted">
                {m.hero_cta_source()}
              </a>
            </div>
          </div>
        )}

        <div className="crt-frame mt-10 flex max-w-xl min-w-0 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-2.5 sm:px-3.5 sm:py-2.5">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-crt text-neon text-sm">
            {installCmd}
            <span className="ml-0.5 inline-block h-3.5 w-1.5 bg-neon align-[-1px] animate-[caret-blink_1.1s_steps(1)_infinite]" />
          </code>
          <button
            type="button"
            onClick={copyInstall}
            className="shrink-0 cursor-pointer self-end border border-ice/70 bg-surface px-2 py-1 font-crt text-[11px] text-ice uppercase sm:self-auto"
          >
            {copied ? m.hero_copy_copied() : m.hero_copy_copy()}
          </button>
        </div>

        <div className="mt-10 flex justify-center md:hidden">
          <div className="monster-glint relative">
            <img
              src="/monster.gif"
              alt={m.brand_monster_alt()}
              className="h-28 w-auto"
              style={{ imageRendering: "pixelated" }}
            />
            <Sticker tone="neon" rotate={9} className="absolute -bottom-1 -left-3 text-[11px]">
              kaja
            </Sticker>
          </div>
        </div>
      </ContentWidth>
    </section>
  )
}
