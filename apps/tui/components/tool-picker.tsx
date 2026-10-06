import { MultiSelect } from "@inkjs/ui"
import { Box, Text, useInput, useWindowSize } from "ink"
import { t } from "../lib/i18n"

// Room MultiSelect takes around a label: the ❯ pointer, spacing and the ✔ mark.
const OPTION_CHROME = 6
const MAX_VISIBLE = 12

/** A tool with what it does, as far as its manifest says. */
export type ToolChoice = { name: string; description?: string }

/** One ability's tools as a checklist, all on unless switched off before: space toggles, Enter saves (the ticked ones), Esc keeps it as it was. */
export function ToolPicker({
  ability,
  tools,
  disabled,
  onSubmit,
  onCancel
}: Readonly<{
  ability: string
  tools: ToolChoice[]
  disabled: string[]
  onSubmit: (kept: string[]) => void
  onCancel: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape) onCancel()
  })
  const { columns } = useWindowSize()
  const nameWidth = Math.max(...tools.map(tool => tool.name.length)) + 2

  const label = (tool: ToolChoice) => {
    const head = tool.name.padEnd(nameWidth)
    const room = columns - OPTION_CHROME - head.length
    const text = tool.description?.replaceAll(/\s+/g, " ") ?? ""
    if (room < 8 || !text) return head.trimEnd()
    return head + (text.length > room ? `${text.slice(0, room - 1)}…` : text)
  }

  return (
    <Box flexDirection="column">
      <Text bold>{t("ability.toolsTitle", { name: ability })}</Text>
      <Text dimColor>{t("ability.toolsHint")}</Text>
      <Box marginTop={1}>
        <MultiSelect
          options={tools.map(tool => ({ label: label(tool), value: tool.name }))}
          defaultValue={tools.map(tool => tool.name).filter(name => !disabled.includes(name))}
          visibleOptionCount={Math.min(tools.length, MAX_VISIBLE)}
          onSubmit={onSubmit}
        />
      </Box>
    </Box>
  )
}
