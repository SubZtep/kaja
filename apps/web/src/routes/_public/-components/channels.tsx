import { cn } from "@kaja/shared/ui"
import { Link, useLoaderData } from "@tanstack/react-router"
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
  children
}: Readonly<{ label: string; title: string; sticker?: string; children: ReactNode }>) {
  return (
    <article className="toy-card gap-2 bg-surface p-4 md:min-h-56">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 font-stamp text-[11px] text-neon uppercase">{label}</p>
        {sticker ? (
          <Sticker rotate={7} className="text-[10px]">
            {sticker}
          </Sticker>
        ) : null}
      </div>
      <h3 className="m-0 font-bold font-display text-fg text-lg leading-tight">{title}</h3>
      {children}
    </article>
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
              "cursor-pointer border px-2 py-1 font-stamp text-[11px] uppercase",
              os === key ? "border-ice bg-ice text-bg" : "border-transparent text-muted hover:text-ice"
            )}
          >
            {key === "unix" ? m.install_mac_linux_label() : m.install_windows_label()}
          </button>
        ))}
      </fieldset>
      <CommandBox command={INSTALL_CMD[os]} look="crt" />
      <p className="mt-3 mb-0 font-crt text-muted text-sm">
        {m.install_binary_prefix()}{" "}
        <a
          href="https://github.com/SubZtep/kaja/releases"
          target="_blank"
          rel="noopener"
          className="inline-block whitespace-nowrap text-neon underline underline-offset-2"
        >
          {m.install_binary_link()}
        </a>
      </p>
    </div>
  )
}

/** Where to talk to it: the chat on this page, Telegram, or the terminal. */
export function Channels() {
  const user = useUser()
  const { apiUrl, chatWidgetKey } = useLoaderData({ from: "__root__" })

  return (
    <section>
      <ContentWidth className="py-10 sm:py-16">
        <SectionTitle title={m.channels_title()} subtitle={m.channels_subtitle()} />
        <div className="grid gap-5 md:grid-cols-3">
          <ChannelCard label={m.channel_browser_label()} title={m.channel_browser_title()} sticker={m.stamp_wip()}>
            <p className="m-0 font-crt text-muted text-sm">{m.channel_browser_body()}</p>
            <button
              type="button"
              className={cn(ACTION, "cursor-pointer")}
              onClick={() => openChatWidget(apiUrl, chatWidgetKey)}
            >
              {m.channel_browser_action()} →
            </button>
          </ChannelCard>

          <ChannelCard label={m.channel_telegram_label()} title={m.hero_telegram_title()}>
            {user ? (
              <TelegramConnectCta actionClassName={ACTION} />
            ) : (
              <>
                <p className="m-0 font-crt text-muted text-sm">{m.hero_telegram_body()}</p>
                <Link to="/signin" className={ACTION}>
                  {m.hero_telegram_action()} →
                </Link>
              </>
            )}
          </ChannelCard>

          <ChannelCard label={m.channel_terminal_label()} title={m.install_terminal_note()}>
            <InstallCommand />
          </ChannelCard>
        </div>
      </ContentWidth>
    </section>
  )
}
