import { getDateTime } from "@kaja/shared/date"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { toast } from "react-toastify"
import { TELEGRAM_LINK_QUERY_KEY, useTelegramLink } from "../../hooks/telegram-link"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { getLocale } from "../../paraglide/runtime.js"
import { ConfirmDialog } from "../ui/confirm-dialog"
import { Loader } from "../ui/loader"
import { ConnectTelegram } from "./connect-telegram"

/** Linked: since when, and a way to disconnect; not linked (or the status can't be read): the connect button. */
export function TelegramStatus() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const status = useTelegramLink()
  const unlink = useMutation({
    mutationFn: () => apiFetch("/telegram/link", undefined, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TELEGRAM_LINK_QUERY_KEY })
      toast.success(m.telegram_unlinked())
    },
    onError: (err: Error) => toast.error(err.message || m.telegram_unlink_error())
  })

  if (status.isLoading) return <Loader slim />
  if (!status.data?.linked || !status.data.linkedAt) return <ConnectTelegram />
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="m-0 flex items-center gap-2 text-sm">
        <Send size={16} className="text-neon" aria-hidden />
        <span className="text-fg">
          {m.telegram_linked_since({ date: getDateTime(status.data.linkedAt, "medium", getLocale()) })}
        </span>
      </p>
      <ConfirmDialog
        title={m.telegram_unlink_confirm_title()}
        description={m.telegram_unlink_confirm_description()}
        confirm={m.telegram_unlink()}
        onConfirm={() => unlink.mutate()}
      >
        <button
          type="button"
          disabled={unlink.isPending}
          className="text-muted hover:text-fg cursor-pointer text-xs underline-offset-2 hover:underline"
        >
          {m.telegram_unlink()}
        </button>
      </ConfirmDialog>
    </div>
  )
}
