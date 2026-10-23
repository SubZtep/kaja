import type { StatsChannel } from "@kaja/schema/api"
import { m } from "../../paraglide/messages.js"

/** Where a chat was started, as the stats show it. */
export const CHANNEL_LABELS: Record<StatsChannel, () => string> = {
  web: () => m.stats_channel_web(),
  telegram: () => m.stats_channel_telegram(),
  widget: () => m.stats_channel_widget()
}
