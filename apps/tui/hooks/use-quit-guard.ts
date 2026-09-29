import { useApp, useInput } from "ink"
import { useEffect, useState } from "react"

const ARMED_MS = 3000

/**
 * Esc quits; but while something is still running (a turn, a command) the first Esc only arms the quit and the next one within a few seconds confirms it.
 * Returns whether the quit is armed, for the key bar to say so. `active` is off while another prompt owns Esc.
 */
export function useQuitGuard(active: boolean, busy: boolean): boolean {
  const { exit } = useApp()
  const [armed, setArmed] = useState(false)

  useInput((_input, key) => {
    if (!active || !key.escape) return
    if (busy && !armed) setArmed(true)
    else exit()
  })

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armed])

  return armed && busy && active
}
