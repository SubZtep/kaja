import type { StartTelegramLinkResponse } from "@kaja/schema/api"
import { useMutation } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Send } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { useApiFetch } from "../../../lib/api-fetch"
import { m } from "../../../paraglide/messages.js"
import { Sticker } from "./sticker"

/** Signed-in CTA: one-time Telegram deep link via the existing link API. */
export function TelegramConnectCta({ className }: Readonly<{ className?: string }>) {
  const apiFetch = useApiFetch()
  const [link, setLink] = useState<string | null>(null)

  const createLink = useMutation({
    mutationFn: () => apiFetch<StartTelegramLinkResponse>("/telegram/admin/link", {}),
    onSuccess: response => setLink(`https://t.me/${response.botUsername}?start=${response.token}`),
    onError: (err: Error) => toast.error(err.message || m.telegram_cta_error())
  })

  return (
    <div className={className}>
      <p className="mb-3 font-display text-fg text-sm">{m.telegram_cta_hint()}</p>
      <Button
        type="button"
        variant="primary"
        className="w-full gap-2 rounded-none! font-stamp text-xs uppercase tracking-wide"
        loading={createLink.isPending}
        onClick={() => createLink.mutate()}
      >
        <Send size={16} />
        {m.telegram_cta()}
      </Button>
      {link ? (
        <div className="crt-frame mt-3 px-3 py-2.5">
          <p className="mb-1.5 text-[12px] text-muted">{m.telegram_cta_notice()}</p>
          <a href={link} target="_blank" rel="noreferrer" className="break-all font-crt text-neon text-sm">
            {link}
          </a>
        </div>
      ) : null}
    </div>
  )
}

const IDLE_GAPS_MS = [9000, 6500, 13000, 7500, 15000, 11000]
const SPIN_DURATIONS_MS = [1000, 1800, 2500, 3000, 1400, 2200]

/** Signed-out promo for the desktop hero column under the monster. */
export function TelegramPromo() {
  const [isSpinning, setIsSpinning] = useState(false)

  useEffect(() => {
    let spins = 0
    let idleTimeout: ReturnType<typeof setTimeout>
    let spinTimeout: ReturnType<typeof setTimeout>

    const scheduleSpin = () => {
      idleTimeout = setTimeout(
        () => {
          spins++
          setIsSpinning(true)
          spinTimeout = setTimeout(
            () => {
              setIsSpinning(false)
              scheduleSpin()
            },
            SPIN_DURATIONS_MS[(spins - 1) % SPIN_DURATIONS_MS.length]
          )
        },
        IDLE_GAPS_MS[spins % IDLE_GAPS_MS.length]
      )
    }

    scheduleSpin()

    return () => {
      clearTimeout(idleTimeout)
      clearTimeout(spinTimeout)
    }
  }, [])

  return (
    <div className="crt-frame w-full max-w-64 px-4 py-4">
      <Sticker tone="neon" rotate={-4} className="mb-3 text-[10px]">
        {m.feature_telegram_title()}
      </Sticker>
      <p className="m-0 font-display font-extrabold text-fg text-lg leading-tight">{m.hero_telegram_title()}</p>
      <p className="mt-2 mb-4 font-crt text-muted text-sm">{m.hero_telegram_body()}</p>
      <Link to="/signin" className="inline-flex items-center gap-1.5 font-stamp text-[11px] text-neon uppercase">
        <Send size={12} className={isSpinning ? "animate-spin" : undefined} />
        {m.hero_telegram_action()}
      </Link>
    </div>
  )
}
