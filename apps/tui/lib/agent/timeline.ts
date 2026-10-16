import type { FinalizedAgentEvent } from "@kaja/nasi"
import type { TimelineEvent } from "../../hooks/use-agent"
import { storedImagePath } from "../memory/store"

/** An agent event as the timeline keeps it: a tool image by the file that shows it (or its data URL) and its stored key. */
export function timelineEvent(event: Exclude<FinalizedAgentEvent, { type: "usage" }>): TimelineEvent {
  if (event.type !== "tool_image") return event
  const { ref, key, mimeType } = event
  return { type: "tool_image", mimeType, ...(key ? { key } : {}), path: (key && storedImagePath(key)) || ref }
}
