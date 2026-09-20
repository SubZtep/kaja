import type { StartTelegramLinkResponse } from "@kaja/schema/api"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Button } from "../form/primitives/Button"

/** Asks the API for a one-time Telegram deep link that connects this account to the cloud bot. */
export function ConnectTelegram() {
  const apiFetch = useApiFetch()
  const [link, setLink] = useState<string | null>(null)

  const createLink = useMutation({
    mutationFn: () => apiFetch<StartTelegramLinkResponse>("/telegram/admin/link", {}),
    onSuccess: response => setLink(`https://t.me/${response.botUsername}?start=${response.token}`),
    onError: (err: Error) => toast.error(err.message || m.telegram_connect_error_failed())
  })

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted text-sm">{m.telegram_connect_description()}</p>
      <Button
        type="button"
        className="mt-2 self-start"
        loading={createLink.isPending}
        onClick={() => createLink.mutate()}
      >
        {m.telegram_connect_button()}
      </Button>
      {link && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-4">
          <p className="mb-2 text-fg text-sm">{m.telegram_connect_notice()}</p>
          <a href={link} target="_blank" rel="noreferrer" className="break-all font-mono text-neon text-sm">
            {link}
          </a>
        </div>
      )}
    </div>
  )
}
