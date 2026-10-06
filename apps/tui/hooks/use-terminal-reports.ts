import { useStdin } from "ink"
import { useEffect, useEffectEvent } from "react"
import { splitTerminalReports } from "../lib/terminal-input"

/**
 * Calls `handler` with each escape sequence the terminal sends (mouse, focus, colour-scheme reports, …), ESC included.
 * Ink 8 drops the ones it has no key for before useInput, so this listens to the raw stdin chunks Ink reads: a "data"
 * listener next to Ink's "readable" one sees every chunk without taking it away from Ink.
 */
export function useTerminalReports(handler: (report: string) => void, isActive = true) {
  const { stdin } = useStdin()
  const onReport = useEffectEvent(handler)

  useEffect(() => {
    if (!isActive || !stdin) return
    const onData = (chunk: Buffer | string) => {
      for (const report of splitTerminalReports(chunk.toString())) onReport(report)
    }
    stdin.on("data", onData)
    return () => {
      stdin.off("data", onData)
    }
  }, [isActive, stdin])
}
