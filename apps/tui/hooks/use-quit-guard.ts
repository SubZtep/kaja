import { useApp, useInput } from "ink"
import { useEffect, useState } from "react"

const ARMED_MS = 3000

/**
 * Esc quits; but while something is still running (a turn, a command) the first Esc only arms the quit and the next one within a few seconds confirms it.
 * Returns whether the quit is armed (for the key bar to say so) and `press`, the same Esc as a click on the key bar. `active` is off while another prompt owns Esc.
 */
export function useQuitGuard(active: boolean, busy: boolean): { armed: boolean; press: () => void } {
  const { exit } = useApp()
  const [armed, setArmed] = useState(false)

  const press = () => {
    if (!active) return
    if (busy && !armed) setArmed(true)
    else exit()
  }
  useInput((_input, key) => {
    if (key.escape) press()
  })

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armed])

  return { armed: armed && busy && active, press }
}
