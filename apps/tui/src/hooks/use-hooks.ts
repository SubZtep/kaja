import { useEffect, useRef } from "react"
import { toSpeakable } from "../lib/audio/speakable"
import { fireHook, type HookEvent, type HookName } from "../lib/config/hooks"
import { t } from "../lib/i18n"
import type { TimelineEvent } from "./use-agent"

/** Which hook an event fires, and what it carries; null for events with no hook. */
function hookFor(event: TimelineEvent): ({ name: HookName } & HookEvent) | null {
  switch (event.type) {
    case "message":
    case "final":
      return { name: "message", text: toSpeakable(event.content ?? "") }
    case "ask_user":
      // A plain reply ending in "?" is an ask_user event too, but only the tool call expects an answer
      return {
        name: event.fromTool ? "question" : "message",
        text: toSpeakable(event.question),
        title: t("hooks.questionTitle")
      }
    case "confirm_command":
      return { name: "confirm", text: event.description, title: t("hooks.confirmTitle") }
    case "confirm_tool":
      return { name: "confirm", text: event.summary, title: t("hooks.confirmTitle") }
    case "reasoning":
      return { name: "reasoning" }
    case "tool_call":
    case "tool_image":
    case "display_image":
    case "client_tool_calls":
      return { name: "tool_call" }
    case "compacted":
    case "condensed":
      return { name: "notice" }
    case "notice":
      return { name: "notice", text: event.text }
    case "persona_switch":
      return {
        name: "persona_switch",
        text: t("cli.personaSwitchedMessage", { label: event.label }),
        title: t("cli.personaSwitchedTitle")
      }
    case "error":
      return { name: "error", text: event.text, title: t("hooks.errorTitle") }
    default:
      return null
  }
}

/**
 * Runs hooks.toml's commands for each newly arrived {@link TimelineEvent} (see {@link hookFor}); a message's or
 * question's text is Markdown-free speech text, and one with nothing left to say fires nothing. The file is read on the
 * first event; with no hooks nothing runs. Events already there on mount (a resumed session) are not replayed.
 */
export function useHooks(events: TimelineEvent[]) {
  const seen = useRef(events.length)
  useEffect(() => {
    const pending = events.slice(seen.current)
    seen.current = events.length
    for (const event of pending) {
      const hook = hookFor(event)
      if (!hook || (hook.text === "" && (hook.name === "message" || hook.name === "question"))) continue
      fireHook(hook.name, hook)
    }
  }, [events])
}
