import { Box, Text } from "ink"
import { useKey } from "../../hooks/use-key"
import { t } from "../../lib/i18n"
import { Modal } from "../elem/modal"
import { useKajaTheme } from "../theme"

/** The keys the chat answers to, with the hotkey modifier's name in front of the letters. */
function helpRows(modifier: string, persona: boolean) {
  return [
    ...(persona ? [{ key: `${modifier}+P`, label: t("help.persona") }] : []),
    { key: `${modifier}+R`, label: t("help.copy") },
    { key: `${modifier}+E`, label: t("help.expand") },
    { key: `${modifier}+O`, label: t("help.command") },
    { key: `${modifier}+L`, label: t("help.help") },
    { key: "PgUp/PgDn", label: t("help.scroll") },
    { key: "Shift+Enter", label: t("help.newline") }
  ]
}

// A child of the Modal, not part of HelpModal: only inside it do keys count while the rest of the screen is blocked
function DocsKey({ onOpenDocs }: Readonly<{ onOpenDocs: () => void }>) {
  useKey((_input, key) => {
    if (key.return) onOpenDocs()
  })
  return null
}

/** What the chat can do and how, as a {@link Modal}; Enter opens the documentation. */
export function HelpModal({
  modifier,
  persona,
  docsUrl,
  onOpenDocs,
  onClose
}: Readonly<{
  /** The hotkey modifier as the key bar names it, e.g. "Alt". */
  modifier: string
  /** Whether personas can be switched here. */
  persona: boolean
  docsUrl: string
  onOpenDocs: () => void
  onClose: () => void
}>) {
  const { keyCap, muted } = useKajaTheme()
  const rows = helpRows(modifier, persona)
  const keyWidth = Math.max(...rows.map(row => row.key.length))

  return (
    <Modal
      title={t("help.title")}
      width={72}
      onClose={onClose}
      footer={
        <Box columnGap={1}>
          <Text {...keyCap()}>Enter</Text>
          <Text>{t("help.openDocs")}</Text>
        </Box>
      }
    >
      <DocsKey onOpenDocs={onOpenDocs} />
      <Text>{t("help.intro")}</Text>
      <Box flexDirection="column" marginY={1}>
        {rows.map(row => (
          <Box key={row.key} columnGap={2}>
            <Box width={keyWidth} flexShrink={0}>
              <Text bold>{row.key}</Text>
            </Box>
            <Text>{row.label}</Text>
          </Box>
        ))}
      </Box>
      <Text {...muted()}>{docsUrl}</Text>
    </Modal>
  )
}
