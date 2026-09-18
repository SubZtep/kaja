import { MultiSelect } from "@inkjs/ui"
import { Box, Text, useInput, useStdout } from "ink"
import { t } from "../lib/i18n"

// Room MultiSelect takes around a label: the ❯ pointer, spacing and the ✔ mark.
const OPTION_CHROME = 6
const MAX_VISIBLE = 10

export type PickerSkill = {
  name: string
  description?: string
  /** Why it can't load; shown below the list, not selectable. */
  error?: string
  /** Not from the marketplace sync — written by the user. */
  local: boolean
}

/** One line per skill: the description is cut to whatever the terminal width leaves after the name. */
function optionLabel(skill: PickerSkill, columns: number): string {
  const head = `${skill.name}${skill.local ? ` [${t("pkg.local")}]` : ""}`
  const room = columns - OPTION_CHROME - head.length - 2
  const description = skill.description ?? ""
  if (room < 8) return head
  return `${head}  ${description.length > room ? `${description.slice(0, room - 1)}…` : description}`
}

/** `kaja pkg`'s checklist: space toggles, Enter submits the selected names, Esc cancels. */
export function PackagePicker({
  skills,
  enabled,
  onSubmit,
  onCancel
}: Readonly<{
  skills: PickerSkill[]
  enabled: string[]
  onSubmit: (names: string[]) => void
  onCancel: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape) onCancel()
  })
  const { stdout } = useStdout()
  const columns = stdout.columns ?? 80

  const selectable = skills.filter(s => !s.error)
  const broken = skills.filter(s => s.error)

  return (
    <Box flexDirection="column">
      <Text bold>{t("pkg.skillsTitle")}</Text>
      <Text dimColor>{t("pkg.pickerHint")}</Text>
      <Box marginTop={1}>
        {selectable.length > 0 ? (
          <MultiSelect
            options={selectable.map(s => ({ label: optionLabel(s, columns), value: s.name }))}
            defaultValue={enabled.filter(name => selectable.some(s => s.name === name))}
            visibleOptionCount={Math.min(selectable.length, MAX_VISIBLE)}
            onSubmit={onSubmit}
          />
        ) : (
          <Text>{t("pkg.empty")}</Text>
        )}
      </Box>
      {broken.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">{t("pkg.invalidTitle")}</Text>
          {broken.map(s => (
            <Text key={s.name} dimColor>
              {`  ${s.name}: ${s.error}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
