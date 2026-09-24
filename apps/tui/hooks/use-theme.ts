import { useInput, useStdout } from "ink"
import { useEffect, useState } from "react"
import { savePreferences } from "../lib/config/config"
import { log } from "../lib/logger"
import { type Brightness, setConsoleTheme, themeFollowsTerminal } from "../lib/terminal-background"
import { COLOR_SCHEME_REPORTING_DISABLE, COLOR_SCHEME_REPORTING_ENABLE, colorSchemeReport } from "../lib/terminal-input"

/**
 * The chat's theme. Starts on the one resolved before render; while settings.toml says `auto` it follows the
 * terminal's colour-scheme reports (DECSET 2031 — a terminal without them just never sends one), and `toggle` flips it
 * and saves the choice, which ends the following: picking one by hand is saying which one you want.
 */
export function useTheme(initial: Brightness) {
  const { stdout } = useStdout()
  const [theme, setTheme] = useState(initial)
  const [following, setFollowing] = useState(themeFollowsTerminal)

  const apply = (next: Brightness) => {
    setTheme(next)
    // So what's printed after the chat exits matches it
    setConsoleTheme(next)
  }

  useEffect(() => {
    if (!following || !stdout) return
    const write = (s: string) => {
      try {
        stdout.write(s)
      } catch {
        // non-TTY or already closed
      }
    }
    write(COLOR_SCHEME_REPORTING_ENABLE)
    const disable = () => write(COLOR_SCHEME_REPORTING_DISABLE)
    process.on("exit", disable)
    return () => {
      process.off("exit", disable)
      disable()
    }
  }, [following, stdout])

  useInput(input => {
    const scheme = following ? colorSchemeReport(input) : null
    if (scheme) apply(scheme)
  })

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark"
    apply(next)
    setFollowing(false)
    savePreferences({ theme: next }).catch(error => log.warn("Failed to save the theme", { error }))
  }

  return { theme, toggle }
}
