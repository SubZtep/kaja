import { Link, useLocation } from "@tanstack/react-router"
import { Send } from "lucide-react"
import { useTelegramNudge } from "../../hooks/telegram-link"
import { m } from "../../paraglide/messages.js"

/** Slim reminder above every portal page until Telegram is linked; Home and the Telegram page carry the full prompt. */
export function TelegramBanner() {
  const nudge = useTelegramNudge()
  const { pathname } = useLocation()
  if (!nudge || /\/(home|channels\/telegram)\/?$/.test(pathname)) return null

  return (
    <div className="border-neon/40 bg-surface mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-sm">
      <Send size={16} className="text-neon shrink-0" aria-hidden />
      <span className="text-fg min-w-0 flex-1">{m.telegram_nudge_title()}</span>
      <Link to="/channels/telegram" className="text-neon font-bold underline-offset-2 hover:underline">
        {m.telegram_nudge_button()}
      </Link>
    </div>
  )
}
