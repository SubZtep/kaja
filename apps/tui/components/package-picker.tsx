import { MultiSelect, PasswordInput } from "@inkjs/ui"
import { Box, Text, useInput, useStdout } from "ink"
import { t } from "../lib/i18n"

// Room MultiSelect takes around a label: the ❯ pointer, spacing and the ✔ mark.
const OPTION_CHROME = 6
const MAX_VISIBLE = 10

export type PickerItem = {
  type: "skill" | "tool"
  name: string
  description?: string
  /** Why it can't load; shown below the list, not selectable. */
  error?: string
  /** Not from the marketplace sync — written by the user. */
  local: boolean
  /** Tools only: the host it calls and whether it needs a key, shown before enabling. */
  domain?: string
  needsKey?: boolean
}

export type PickerSelection = { skills: string[]; tools: string[] }

const optionValue = (item: Pick<PickerItem, "type" | "name">) => `${item.type}:${item.name}`

/** One line per package: type, name, a tool's domain and key need, then as much description as fits the terminal. */
function optionLabel(item: PickerItem, columns: number): string {
  const type = t(item.type === "skill" ? "pkg.typeSkill" : "pkg.typeTool").padEnd(6)
  const where = item.domain ? `  ${item.domain} · ${t(item.needsKey ? "pkg.needsKey" : "pkg.noKey")}` : ""
  const head = `${type}${item.name}${item.local ? ` [${t("pkg.local")}]` : ""}${where}`
  const room = columns - OPTION_CHROME - head.length - 2
  const description = item.description ?? ""
  if (room < 8) return head
  return `${head}  ${description.length > room ? `${description.slice(0, room - 1)}…` : description}`
}

/** `kaja pkg`'s checklist of skills and tools: space toggles, Enter submits, Esc cancels. */
export function PackagePicker({
  items,
  enabled,
  onSubmit,
  onCancel
}: Readonly<{
  items: PickerItem[]
  enabled: PickerSelection
  onSubmit: (selection: PickerSelection) => void
  onCancel: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape) onCancel()
  })
  const { stdout } = useStdout()
  const columns = stdout.columns ?? 80

  const selectable = items.filter(item => !item.error)
  const broken = items.filter(item => item.error)
  const enabledValues = [
    ...enabled.skills.map(name => optionValue({ type: "skill", name })),
    ...enabled.tools.map(name => optionValue({ type: "tool", name }))
  ]

  return (
    <Box flexDirection="column">
      <Text bold>{t("pkg.title")}</Text>
      <Text dimColor>{t("pkg.pickerHint")}</Text>
      <Box marginTop={1}>
        {selectable.length > 0 ? (
          <MultiSelect
            options={selectable.map(item => ({ label: optionLabel(item, columns), value: optionValue(item) }))}
            defaultValue={enabledValues.filter(value => selectable.some(item => optionValue(item) === value))}
            visibleOptionCount={Math.min(selectable.length, MAX_VISIBLE)}
            onSubmit={values =>
              onSubmit({
                skills: values.filter(v => v.startsWith("skill:")).map(v => v.slice("skill:".length)),
                tools: values.filter(v => v.startsWith("tool:")).map(v => v.slice("tool:".length))
              })
            }
          />
        ) : (
          <Text>{t("pkg.empty")}</Text>
        )}
      </Box>
      {broken.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">{t("pkg.invalidTitle")}</Text>
          {broken.map(item => (
            <Text key={optionValue(item)} dimColor>
              {`  ${item.name}: ${item.error}`}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

/** Asks for one package's API key, masked. Enter with a value saves it; Esc or an empty Enter skips. */
export function PackageKeyPrompt({
  name,
  where,
  onSubmit,
  onSkip
}: Readonly<{
  name: string
  /** Where the key goes, e.g. "header X-Api-Key", so the user knows which key the API expects. */
  where: string
  onSubmit: (key: string) => void
  onSkip: () => void
}>) {
  useInput((_input, key) => {
    if (key.escape) onSkip()
  })
  return (
    <Box flexDirection="column">
      <Text bold>{t("pkg.keyPrompt", { name, where })}</Text>
      <Text dimColor>{t("pkg.keyHint")}</Text>
      <PasswordInput
        placeholder={t("pkg.keyPlaceholder")}
        onSubmit={value => (value.trim() ? onSubmit(value.trim()) : onSkip())}
      />
    </Box>
  )
}
