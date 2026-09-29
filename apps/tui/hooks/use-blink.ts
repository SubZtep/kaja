import { useEffect, useState } from "react"

/**
 * Toggles every `intervalMs`, for a blinking cursor. Pure rendering signal —
 * callers must not gate input handling on it (that made arrow keys/Home/End
 * stop working every other second when `showCursor` did double duty as both
 * "field has a cursor" and "cursor is in its visible blink phase"). While
 * `active` is false, stays hidden (`false`) rather than frozen visible.
 * A change of `resetKey` (e.g. the typed text) shows the cursor and restarts the
 * cycle, so it stays solid while typing and only blinks when idle.
 */
export function useBlink(intervalMs: number, active: boolean, resetKey?: unknown): boolean {
  const [on, setOn] = useState(true)

  useEffect(() => {
    if (!active) {
      setOn(false)
      return
    }
    setOn(true)
    const timer = setInterval(() => {
      setOn(prev => !prev)
    }, intervalMs)

    return () => {
      clearInterval(timer)
    }
  }, [intervalMs, active, resetKey])

  return on
}
