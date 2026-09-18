import { useInput, useStdout } from "ink"
import { useEffect, useState } from "react"
import { FOCUS_REPORTING_DISABLE, FOCUS_REPORTING_ENABLE, windowFocusReport } from "../lib/terminal-input"

/**
 * Tracks whether the terminal window has OS-level focus, via xterm's
 * focus-reporting mode (DECSET 1004): the terminal sends `ESC[I` on
 * focus-in, `ESC[O` on focus-out, once asked. Not universally supported —
 * an unsupported terminal just never sends either, so this stays `true`
 * (the default), the same as before this existed. Always disables on
 * unmount / process exit so the terminal is not left sticky, mirroring
 * {@link useMouseTracking}.
 */
export function useWindowFocus(): boolean {
  const { stdout } = useStdout()
  const [focused, setFocused] = useState(true)

  useEffect(() => {
    if (!stdout) return

    const write = (s: string) => {
      try {
        stdout.write(s)
      } catch {
        // non-TTY or already closed
      }
    }

    write(FOCUS_REPORTING_ENABLE)

    const disable = () => write(FOCUS_REPORTING_DISABLE)
    process.on("exit", disable)
    // Best-effort on signals; exit handler still runs after.
    process.on("SIGINT", disable)
    process.on("SIGTERM", disable)

    return () => {
      process.off("exit", disable)
      process.off("SIGINT", disable)
      process.off("SIGTERM", disable)
      disable()
    }
  }, [stdout])

  useInput(input => {
    const report = windowFocusReport(input)
    if (report === "in") setFocused(true)
    else if (report === "out") setFocused(false)
  })

  return focused
}
