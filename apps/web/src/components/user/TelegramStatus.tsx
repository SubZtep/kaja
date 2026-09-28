import { telegramLinkStatusSchema } from "@kaja/schema/api"
import { getDateTime } from "@kaja/shared/date"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { getLocale } from "../../paraglide/runtime.js"
import { ConfirmDialog } from "../ui/ConfirmDialog"
import { Loader } from "../ui/Loader"
import { ConnectTelegram } from "./ConnectTelegram"

const LINK_QUERY_KEY = ["telegram", "link"]

/** Linked: since when, and a way to disconnect; not linked (or the status can't be read): the connect button. */
export function TelegramStatus() {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: LINK_QUERY_KEY,
    queryFn: () => apiFetch("/telegram/admin/link").then(r => telegramLinkStatusSchema.parse(r))
  })
  const unlink = useMutation({
    mutationFn: () => apiFetch("/telegram/admin/link", undefined, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LINK_QUERY_KEY })
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
          className="cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"
        >
          {m.telegram_unlink()}
        </button>
      </ConfirmDialog>
    </div>
  )
}
