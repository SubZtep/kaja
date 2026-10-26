import { t } from "../../lib/i18n"
import { CodeViewContext } from "../elem/code-expand"
import { CodePreview } from "../elem/code-preview"
import { Modal } from "../elem/modal"
import { useKajaTheme } from "../theme"

// Fully expanded: the preview still cuts what wouldn't fit the terminal, with "… N more lines"
const EXPANDED = { expanded: true, lines: 0 }

/**
 * The command (or request summary) an approval is about, in a {@link Modal}; the approval prompt keeps it out of the
 * chat.
 */
export function CommandModal({
  command,
  kind,
  onClose
}: Readonly<{ command: string; kind: "command" | "tool"; onClose: () => void }>) {
  const { warning } = useKajaTheme()
  return (
    <Modal
      title={t(kind === "tool" ? "confirmCommand.requestTitle" : "confirmCommand.commandTitle")}
      width={100}
      onClose={onClose}
    >
      <CodeViewContext.Provider value={EXPANDED}>
        <CodePreview command={command} kind={kind} tone={warning()} />
      </CodeViewContext.Provider>
    </Modal>
  )
}
