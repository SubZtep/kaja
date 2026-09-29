import { Box, Text } from "ink"
import { isDangerousCommand } from "../../lib/agent/command-risk"
import { t } from "../../lib/i18n"
import { SelectMenu } from "../elem/select-menu"
import { useKajaTheme } from "../theme"

/**
 * Yes/No gate shown in place of the input field while a run_command call, or
 * an HTTP tool call that changes something (`kind: "tool"`), is awaiting approval. Mounted only while unresolved — selecting either option
 * hands off to the caller, which feeds the outcome back to the agent.
 * While `running` (approved and the command is executing) the menu is
 * replaced by a status line: the command can take a while and Menu would
 * otherwise sit there fully interactive with no sign anything happened.
 *
 * It doesn't repeat the command: that is the last row of the chat (a capped, highlighted preview, see CodePreview),
 * so a long generated script can't push the menu below the terminal's visible rows.
 */
export function ConfirmCommand({
  command,
  description,
  kind = "command",
  running,
  onResolve
}: Readonly<{
  /** The shell command, or for `kind: "tool"` the request summary; only used to judge the risk, the chat shows it. */
  command: string
  description: string
  kind?: "command" | "tool"
  running: boolean
  onResolve: (approved: boolean) => void
}>) {
  const dangerous = kind === "command" && isDangerousCommand(command)
  const { danger, warning } = useKajaTheme()
  const tone = dangerous ? danger() : warning()

  return (
    <Box flexDirection="column" flexShrink={0} width="100%">
      <Text {...tone}>{dangerous ? `⚠ ${description}` : description}</Text>
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
