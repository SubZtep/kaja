import chalk from "chalk"
import { highlight } from "cli-highlight"
import { Box, Text, useWindowSize } from "ink"
import { useContext } from "react"
import { isDangerousCommand } from "../../lib/agent/command-risk"
import { t } from "../../lib/i18n"
import { CODE_PREVIEW_LINES, CodeExpandContext } from "../elem/code-expand"
import { codeTheme } from "../elem/markdown"
import { SelectMenu } from "../elem/select-menu"
import { type Palette, useKajaTheme, usePalette } from "../theme"

/** The command in shell colours; plain when colour is off or the highlighter can't take it. */
function highlightShell(command: string, palette: Palette): string | undefined {
  if (chalk.level === 0) return undefined
  try {
    return highlight(command, { language: "bash", theme: codeTheme(palette) })
  } catch {
    return undefined
  }
}

/**
 * Yes/No gate shown in place of the input field while a run_command call, or
 * an HTTP tool call that changes something (`kind: "tool"`), is awaiting approval. Mounted only while unresolved — selecting either option
 * hands off to the caller, which feeds the outcome back to the agent.
 * While `running` (approved and the command is executing) the menu is
 * replaced by a status line: the command can take a while and Menu would
 * otherwise sit there fully interactive with no sign anything happened.
 *
 * The command preview is capped at CODE_PREVIEW_LINES (all of it, up to the screen, once expanded): a generated multi-line
 * script (e.g. a Python heredoc) can otherwise grow tall enough to push the
 * Menu below the terminal's visible rows, leaving it unreachable.
 */
export function ConfirmCommand({
  command,
  description,
  kind = "command",
  running,
  onResolve
}: Readonly<{
  /** The shell command, or for `kind: "tool"` the request summary (method, URL, body preview). */
  command: string
  description: string
  kind?: "command" | "tool"
  running: boolean
  onResolve: (approved: boolean) => void
}>) {
  const dangerous = kind === "command" && isDangerousCommand(command)
  const { danger, warning } = useKajaTheme()
  const tone = dangerous ? danger() : warning()
  const palette = usePalette()
  const expanded = useContext(CodeExpandContext)
  const { rows } = useWindowSize()
  const lines = command.split("\n")
  // Expanded still leaves room for the chrome around it, so the menu stays on screen
  const room = Math.max(3, rows - 12)
  const shown = expanded ? room : Math.min(CODE_PREVIEW_LINES, room)
  const preview = lines.slice(0, shown).join("\n")
  const hiddenLines = lines.length - shown
  const code = kind === "command" ? highlightShell(preview, palette) : undefined

  return (
    <Box flexDirection="column" flexShrink={0} width="100%">
      <Text {...tone}>{dangerous ? `⚠ ${description}` : description}</Text>
      <Box>
        <Text {...tone}>{kind === "tool" ? "→ " : "$ "}</Text>
        {code ? <Text>{code}</Text> : <Text {...tone}>{preview}</Text>}
      </Box>
      {hiddenLines > 0 && <Text dimColor>{t("confirmCommand.truncated", { count: hiddenLines })}</Text>}
      {running ? (
        <Text dimColor>{t("confirmCommand.running")}</Text>
      ) : (
        <SelectMenu
          items={[t("confirmCommand.yes"), t("confirmCommand.no")]}
          onSelect={index => onResolve(index === 0)}
          onClose={() => onResolve(false)}
        />
      )}
      <Text dimColor>{`> ${t("confirmCommand.inputLocked")}`}</Text>
    </Box>
  )
}
