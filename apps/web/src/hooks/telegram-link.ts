import { telegramLinkStatusSchema } from "@kaja/schema/api"
import { useQuery } from "@tanstack/react-query"
import { useApiFetch } from "../lib/api-fetch"
import { useUser } from "./user"

export const TELEGRAM_LINK_QUERY_KEY = ["telegram", "link"]

/** The signed-in user's Telegram link status; one cache entry shared by the card, the hero, the banner and the menu dot. */
export function useTelegramLink(enabled = true) {
  const apiFetch = useApiFetch()
  return useQuery({
    queryKey: TELEGRAM_LINK_QUERY_KEY,
    queryFn: () => apiFetch("/telegram/link").then(r => telegramLinkStatusSchema.parse(r)),
    enabled
  })
}

/** True only on a confirmed "not linked" with a running bot, so a failed request or an unconfigured bot never nags. */
export function useTelegramNudge() {
  const user = useUser()
  const { data } = useTelegramLink(user !== null)
  return data !== undefined && !data.linked && data.botUsername !== null
}
