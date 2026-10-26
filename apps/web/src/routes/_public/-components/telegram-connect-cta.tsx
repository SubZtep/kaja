import type { StartTelegramLinkResponse } from "@kaja/schema/api"
import { useMutation } from "@tanstack/react-query"
import { toast } from "react-toastify"
import { useApiFetch } from "../../../lib/api-fetch"
import { cn } from "../../../lib/cn"
import { m } from "../../../paraglide/messages.js"

/** Signed-in Telegram card body: one-time deep link via the existing link API. */
export function TelegramConnectCta({ actionClassName }: Readonly<{ actionClassName?: string }>) {
  const apiFetch = useApiFetch()

  const createLink = useMutation({
    mutationFn: () => apiFetch<StartTelegramLinkResponse>("/telegram/link", {}),
    onError: (err: Error) => toast.error(err.message || m.telegram_cta_error())
  })
  const link = createLink.data ? `https://t.me/${createLink.data.botUsername}?start=${createLink.data.token}` : null

  return (
    <>
      <p className="font-crt text-muted m-0 text-sm">{m.telegram_cta_hint()}</p>
      {link ? (
        <div className="mt-auto pt-4">
          <p className="font-crt text-muted mt-0 mb-1.5 text-xs">{m.telegram_cta_notice()}</p>
          <a href={link} target="_blank" rel="noreferrer" className="font-crt text-neon text-sm break-all">
            {link}
          </a>
        </div>
      ) : (
        <button
          type="button"
          disabled={createLink.isPending}
          onClick={() => createLink.mutate()}
          className={cn(actionClassName, "cursor-pointer disabled:cursor-wait disabled:opacity-60")}
        >
          {m.telegram_cta()} →
        </button>
      )}
    </>
  )
}
