import chalk from "chalk"
import { highlight } from "cli-highlight"
import { Box, Text, type TextProps, useWindowSize } from "ink"
import { useContext } from "react"
import { t } from "../../lib/i18n"
import { guessLanguage } from "../../lib/markdown/guess-language"
import { type Palette, usePalette } from "../theme"
import { CodeViewContext, useReportOverflow } from "./code-expand"
import { codeTheme } from "./markdown"

function safeHighlight(code: string, language: string, palette: Palette): string {
  try {
    return highlight(code, { language, theme: codeTheme(palette) })
  } catch {
    return code
  }
}

// A heredoc or `-c "` / `-e '` opener on the first line: what follows is a script in another language, not shell
const SCRIPT_OPENER = /(<<-?\s*['"]?\w+['"]?|\s-[ce]\s+["'])\s*$/

/** A shell command in colour; the body of a heredoc or `python -c "…"` is coloured as its own language when it can be guessed. */
function highlightCommand(command: string, palette: Palette): string {
  const newline = command.indexOf("\n")
  if (newline !== -1 && SCRIPT_OPENER.test(command.slice(0, newline))) {
    const body = command.slice(newline + 1)
    const language = guessLanguage(body)
    if (language)
      return `${safeHighlight(command.slice(0, newline), "bash", palette)}\n${safeHighlight(body, language, palette)}`
  }
  return safeHighlight(command, "bash", palette)
}

/**
 * The command (or request summary) an approval is about: cut to the code-preview line count with "… N more lines" until expanded, shell-highlighted
 * for a command. `tone` colours it when it can't be highlighted (colour off) and the `$`/`→` marker.
 */
export function CodePreview({
  command,
  kind = "command",
  tone
}: Readonly<{ command: string; kind?: "command" | "tool"; tone: TextProps }>) {
  const palette = usePalette()
  const view = useContext(CodeViewContext)
  const { rows } = useWindowSize()
  const lines = command.split("\n")
  // Expanded still leaves room for the chrome around it, so the menu stays on screen
  const shown = view.expanded ? Math.max(3, rows - 12) : view.lines
  const preview = lines.slice(0, shown).join("\n")
  const hidden = lines.length - shown
  useReportOverflow(lines.length > view.lines)
  const coloured = kind === "command" && chalk.level > 0 ? highlightCommand(preview, palette) : undefined

  return (
    <Box flexDirection="column">
      <Box>
        <Text {...tone}>{kind === "tool" ? "→ " : "$ "}</Text>
        {coloured ? <Text>{coloured}</Text> : <Text {...tone}>{preview}</Text>}
      </Box>
      {hidden > 0 && <Text dimColor>{t("confirmCommand.truncated", { count: hidden })}</Text>}
    </Box>
  )
}
