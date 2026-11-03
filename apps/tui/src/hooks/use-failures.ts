import { useEffect } from "react"
import { uiEvents } from "../lib/ui-events"

/** Shows errors nothing else caught (`uiEvents`' `failure`) as error lines in the chat, rather than ending it. */
export function useFailures(push: (event: { type: "error"; text: string; category: "unknown" }) => void) {
  useEffect(() => {
    const onFailure = (text: string) => push({ type: "error", text, category: "unknown" })
    uiEvents.on("failure", onFailure)
    return () => {
      uiEvents.off("failure", onFailure)
    }
  }, [push])
}
