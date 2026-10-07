import { useStdout } from "ink"
import { useEffect, useState } from "react"
import { setConsoleTheme, type ThemeName, themeFollowsTerminal } from "../lib/terminal-background"
import { COLOR_SCHEME_REPORTING_DISABLE, COLOR_SCHEME_REPORTING_ENABLE, colorSchemeReport } from "../lib/terminal-input"
import { useTerminalReports } from "./use-terminal-reports"

/**
 * The chat's theme. Starts on the one resolved before render; while settings.toml says `auto` it follows the
 * terminal's colour-scheme reports (DECSET 2031 — a terminal without them just never sends one).
 */
export function useTheme(initial: ThemeName) {
  const { stdout } = useStdout()
  const [theme, setTheme] = useState(initial)
  const [following] = useState(themeFollowsTerminal)

  const apply = (next: ThemeName) => {
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

  useTerminalReports(input => {
    const scheme = colorSchemeReport(input)
    if (scheme) apply(scheme)
  }, following)

  return theme
}
