import { telegramLinkStatusSchema } from "@kaja/schema/api"
import { getDateTime } from "@kaja/shared/date"
import { useQuery } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { getLocale } from "../../paraglide/runtime.js"
import { Loader } from "../ui/Loader"
import { ConnectTelegram } from "./ConnectTelegram"

/** Linked: since when; not linked (or the status can't be read): the connect button. */
export function TelegramStatus() {
  const apiFetch = useApiFetch()
  const status = useQuery({
    queryKey: ["telegram", "link"],
    queryFn: () => apiFetch("/telegram/admin/link").then(r => telegramLinkStatusSchema.parse(r))
  })

  if (status.isLoading) return <Loader slim />
  if (!status.data?.linked || !status.data.linkedAt) return <ConnectTelegram />
  return (
    <p className="m-0 flex items-center gap-2 text-sm">
      <Send size={16} className="text-neon" aria-hidden />
      <span className="text-fg">
        {m.telegram_linked_since({ date: getDateTime(status.data.linkedAt, "medium", getLocale()) })}
      </span>
    </p>
  )
}
