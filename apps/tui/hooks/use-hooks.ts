import { useEffect, useRef, useState } from "react"
import { toSpeakable } from "../lib/audio/speakable"
import { type HookName, loadHooks, runHook } from "../lib/config/hooks"
import type { TimelineEvent } from "./use-agent"

/** Which hook an event fires, and the text it carries; null for events with no hook. */
function hookFor(event: TimelineEvent): { name: HookName; text: string } | null {
  switch (event.type) {
    case "message":
    case "final":
      return { name: "message", text: event.content ?? "" }
    case "ask_user":
      return { name: "question", text: event.question }
    default:
      return null
  }
}

/**
 * Runs hooks.toml's commands for each newly arrived {@link TimelineEvent} (see {@link hookFor}), with the text as plain
 * Markdown-free speech text. The file is read once on mount; with no hooks nothing runs. Events already there on mount
 * (a resumed session) are not replayed.
 */
export function useHooks(events: TimelineEvent[]) {
  const [hooks] = useState(loadHooks)
  const seen = useRef(events.length)
  useEffect(() => {
    const pending = events.slice(seen.current)
    seen.current = events.length
    for (const event of pending) {
      const hook = hookFor(event)
      const command = hook && hooks[hook.name]
      if (!hook || !command) continue
      const text = toSpeakable(hook.text)
      if (text) runHook(hook.name, command, text)
    }
  }, [events, hooks])
}
