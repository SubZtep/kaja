import { cn } from "@kaja/shared/ui"
import { useLoaderData } from "@tanstack/react-router"
import { RotateCw } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { CommandBox } from "../../../components/ui/CommandBox"
import { useUser } from "../../../hooks/user"
import { detectInstallOs, INSTALL_CMD, type InstallOs } from "../../../lib/vars"
import { m } from "../../../paraglide/messages.js"
import { SectionTitle } from "./section-title"
import { openChatWidget } from "./showcase"
import { Sticker } from "./sticker"
import { TelegramConnectCta } from "./telegram-connect-cta"

const ACTION = "mt-auto pt-4 text-left font-stamp text-[11px] text-neon uppercase"

function ChannelCard({
  label,
  title,
  sticker,
  className,
  away = false,
  children
}: Readonly<{
  label: string
  title: string
  sticker?: string
  className?: string
  /** Turned away (a flip card's hidden face): out of focus and the accessibility tree. */
  away?: boolean
  children: ReactNode
}>) {
  return (
    <article className={cn("toy-card bg-surface gap-2 p-4 md:min-h-56", className)} inert={away} aria-hidden={away}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-stamp text-neon m-0 text-[11px] uppercase">{label}</p>
        {sticker ? (
          <Sticker rotate={7} className="text-[10px]">
            {sticker}
          </Sticker>
        ) : null}
      </div>
      <h3 className="font-display text-fg m-0 text-lg leading-tight font-bold">{title}</h3>
      {children}
    </article>
  )
}

// Both faces share one grid cell, so the card is as tall as the taller face; toy-card's clip-path flattens 3D, so the faces carry it, not the rotating box
const FACE = "col-start-1 row-start-1 h-full backface-hidden"

/** A visitor's local-or-cloud card: the front says why not to register, the back why to; the links flip it in 3D. */
function GuestBrowserCard() {
  const [flipped, setFlipped] = useState(false)
  // Each face keeps its own label, so the text doesn't swap mid-turn
  const flip = (label: string) => (
    <button
      type="button"
      className={cn(ACTION, "flex cursor-pointer items-center gap-1.5")}
      onClick={() => setFlipped(f => !f)}
    >
      <RotateCw className="size-3.5" aria-hidden />
      {label}
    </button>
  )

  return (
    <div className="h-full perspective-distant">
      <div
        className={cn(
          "grid h-full transition-transform duration-700 transform-3d motion-reduce:duration-0",
          flipped && "rotate-y-180"
        )}
      >
        <ChannelCard
          label={m.channel_choice_label()}
          title={m.channel_choice_local_title()}
          className={FACE}
          away={flipped}
        >
          <p className="font-crt text-muted m-0 text-sm">{m.channel_browser_guest_body()}</p>
          {flip(m.channel_browser_why())}
        </ChannelCard>
        <ChannelCard
          label={m.channel_choice_label()}
          title={m.channel_browser_perks_title()}
          className={cn(FACE, "rotate-y-180")}
          away={!flipped}
        >
          <p className="font-crt text-muted m-0 text-sm">{m.channel_browser_perks_body()}</p>
          {flip(m.channel_browser_why_not())}
        </ChannelCard>
      </div>
    </div>
  )
}

function InstallCommand() {
  const [os, setOs] = useState<InstallOs>("unix")

  useEffect(() => {
    setOs(detectInstallOs())
  }, [])

  return (
    <div className="min-w-0">
      <fieldset className="mb-2 flex gap-1" aria-label={m.install_title()}>
        {(["unix", "windows"] as const).map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={os === key}
            onClick={() => setOs(key)}
            className={cn(
              "font-stamp cursor-pointer border px-2 py-1 text-[11px] uppercase",
              os === key ? "border-ice bg-ice text-bg" : "text-muted hover:text-ice border-transparent"
            )}
          >
            {key === "unix" ? m.install_mac_linux_label() : m.install_windows_label()}
          </button>
        ))}
      </fieldset>
      <CommandBox command={INSTALL_CMD[os]} look="crt" />
      <p className="font-crt text-muted mt-3 mb-0 text-sm">
        {m.install_binary_prefix()}{" "}
        <a
          href="https://github.com/SubZtep/kaja/releases"
          target="_blank"
          rel="noopener"
          className="text-neon inline-block whitespace-nowrap underline underline-offset-2"
        >
          {m.install_binary_link()}
        </a>
      </p>
    </div>
  )
}

/** Anchor for the hero's "run it locally" link. */
export const WAYS_IN_ID = "ways-in"

/** Where to talk to it: local or cloud, the terminal, or Telegram. */
export function Channels() {
  const user = useUser()
  const { apiUrl, chatWidgetKey } = useLoaderData({ from: "__root__" })

  return (
    <section id={WAYS_IN_ID} className="scroll-mt-16">
      <ContentWidth className="py-10 sm:py-16">
        <SectionTitle title={m.channels_title()} />
        <div className="grid gap-5 md:grid-cols-3">
          {user ? (
            <ChannelCard label={m.channel_browser_label()} title={m.channel_browser_title()} sticker={m.stamp_wip()}>
              <p className="font-crt text-muted m-0 text-sm">{m.channel_browser_body()}</p>
              <button
                type="button"
                className={cn(ACTION, "cursor-pointer")}
                onClick={() => openChatWidget(apiUrl, chatWidgetKey)}
              >
                {m.channel_browser_action()} →
              </button>
            </ChannelCard>
          ) : (
            <GuestBrowserCard />
          )}

          <ChannelCard label={m.channel_terminal_label()} title={m.install_terminal_note()}>
            <InstallCommand />
          </ChannelCard>

          <ChannelCard label={m.channel_telegram_label()} title={m.hero_telegram_title()}>
            {user ? (
              <TelegramConnectCta actionClassName={ACTION} />
            ) : (
              <p className="font-crt text-muted m-0 text-sm">{m.hero_telegram_body()}</p>
            )}
          </ChannelCard>
        </div>
      </ContentWidth>
    </section>
  )
}
