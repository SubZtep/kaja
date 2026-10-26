import { writeText } from "tinyclip"
import { fireHook } from "./config/hooks"
import { log } from "./logger"
import type { DisplayEvent } from "./tool-summary"

/** Timeline event types whose text is worth copying to the clipboard: the agent's words, never the user's own message. */
export function copyableText(event: DisplayEvent): string | null {
  switch (event.type) {
    case "message":
      return event.content
    case "final":
      return event.content
    case "ask_user":
      return event.question
    default:
      return null
  }
}

/** Copies `text` to the OS clipboard and fires the `copy` hook; logs rather than throwing on failure. */
export function copyToClipboard(text: string): void {
  writeText(text)
    .then(() => fireHook("copy"))
    .catch(error => log.warn("Copy to clipboard failed", { error }))
}
