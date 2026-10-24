import type { PersonaModels } from "@kaja/schema/cli"
import { isDangerousCommand } from "../../lib/agent/command-risk"
import { t } from "../../lib/i18n"
import { useKajaTheme } from "../theme"
import { Prompt, type PromptSpec } from "./prompt"

/**
 * Approval gate shown in place of the input field while a run_command call, or an HTTP tool call that changes something
 * (`kind: "tool"`), is awaiting approval: yes or no, or write something instead, which declines the call and tells the
 * agent why (`feedback`). Mounted only while unresolved: the outcome goes to the caller, which feeds it back to the
 * agent. While `running` (approved and the command is executing) the menu is replaced by a status line: the command can
 * take a while and the menu would otherwise sit there fully interactive with no sign anything happened.
 *
 * It doesn't show the command, which can be long: the app's key bar offers it in a modal (see CommandModal).
 */
export function ConfirmCommand({
  command,
  description,
  kind = "command",
  running,
  speaking,
  personaModels,
  onDraft,
  onResolve
}: Readonly<{
  /** The shell command, or for `kind: "tool"` the request summary; only used to judge the risk. */
  command: string
  description: string
  kind?: "command" | "tool"
  running: boolean
  speaking?: boolean
  personaModels?: PersonaModels
  /** Called with the text typed beside the answers as it changes. */
  onDraft?: (draft: string) => void
  /** `feedback` is what the user wrote instead of answering, with `approved` false. */
  onResolve: (approved: boolean, feedback?: string) => void
}>) {
  const dangerous = kind === "command" && isDangerousCommand(command)
  const { danger, warning } = useKajaTheme()
  const spec: PromptSpec = {
    title: dangerous ? `! ${description}` : description,
    tone: dangerous ? danger() : warning(),
    options: [
      { kind: "choice", id: "yes", label: t("confirmCommand.yes") },
      { kind: "choice", id: "no", label: t("confirmCommand.no") }
    ],
    placeholder: t("confirmCommand.placeholder")
  }

  return (
    <Prompt
      spec={spec}
      busy={running ? t("confirmCommand.running") : undefined}
      speaking={speaking}
      personaModels={personaModels}
      onDraft={onDraft}
      onResolve={result => (result.kind === "text" ? onResolve(false, result.text) : onResolve(result.id === "yes"))}
      onDismiss={() => onResolve(false)}
    />
  )
}
