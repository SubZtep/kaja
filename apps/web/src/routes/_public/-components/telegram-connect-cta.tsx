import type { StartTelegramLinkResponse } from "@kaja/schema/api"
import { cn } from "@kaja/shared/ui"
import { useMutation } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { useApiFetch } from "../../../lib/api-fetch"
import { m } from "../../../paraglide/messages.js"

/** Signed-in banner: one-time Telegram deep link via the existing link API. */
export function TelegramConnectCta({ className }: Readonly<{ className?: string }>) {
  const apiFetch = useApiFetch()
  const [link, setLink] = useState<string | null>(null)

  const createLink = useMutation({
    mutationFn: () => apiFetch<StartTelegramLinkResponse>("/telegram/admin/link", {}),
    onSuccess: response => setLink(`https://t.me/${response.botUsername}?start=${response.token}`),
    onError: (err: Error) => toast.error(err.message || m.telegram_cta_error())
  })

  return (
    <div className={cn("crt-frame w-full px-4 py-3", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Send size={20} className="shrink-0 text-neon" />
        <p className="m-0 min-w-0 flex-1 font-display text-fg text-sm">{m.telegram_cta_hint()}</p>
        <Button
          type="button"
          variant="primary"
          className="gap-2 rounded-none! font-stamp text-xs uppercase tracking-wide"
          loading={createLink.isPending}
          onClick={() => createLink.mutate()}
        >
          <Send size={16} />
          {m.telegram_cta()}
        </Button>
      </div>
      {link ? (
        <div className="mt-3 border-border border-t pt-2.5">
          <p className="mb-1.5 text-[12px] text-muted">{m.telegram_cta_notice()}</p>
          <a href={link} target="_blank" rel="noreferrer" className="break-all font-crt text-neon text-sm">
            {link}
          </a>
        </div>
      ) : null}
    </div>
  )
}
