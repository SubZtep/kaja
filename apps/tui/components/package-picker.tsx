import { MultiSelect } from "@inkjs/ui"
import { Box, Text, useInput, useStdout } from "ink"
import { t } from "../lib/i18n"

// Room MultiSelect takes around a label: the ❯ pointer, spacing and the ✔ mark.
const OPTION_CHROME = 6
const MAX_VISIBLE = 10

export type PickerItem = {
  type: "skill" | "tool" | "mcp"
  name: string
  description?: string
  /** Why it can't load; shown below the list, not selectable. */
  error?: string
  /** Not from the marketplace sync — written by the user. */
  local: boolean
  /** Tools and MCP servers: the host they call, shown before enabling. */
  domain?: string
  /** stdio MCP servers: the command they run on this machine, shown before enabling. */
  runs?: string
  /** Tools and MCP servers: whether they take a key. */
  key?: "required" | "optional"
}

export type PickerSelection = { skills: string[]; tools: string[]; mcp: string[] }

const TYPE_LABEL_KEY: Record<PickerItem["type"], string> = {
  skill: "pkg.typeSkill",
  tool: "pkg.typeTool",
  mcp: "pkg.typeMcp"
}

const KEY_LABEL_KEY = { required: "pkg.needsKey", optional: "pkg.optionalKey", none: "pkg.noKey" } as const

const optionValue = (item: Pick<PickerItem, "type" | "name">) => `${item.type}:${item.name}`

/** One line per package: type, name, where it connects (or what it runs) and its key need, then as much description as fits. */
function optionLabel(item: PickerItem, columns: number): string {
  const type = t(TYPE_LABEL_KEY[item.type]).padEnd(6)
  const target = item.domain ?? (item.runs ? t("pkg.runs", { command: item.runs }) : undefined)
  const where = target ? `  ${target} · ${t(KEY_LABEL_KEY[item.key ?? "none"])}` : ""
  const head = `${type}${item.name}${item.local ? ` [${t("pkg.local")}]` : ""}${where}`
  const room = columns - OPTION_CHROME - head.length - 2
  const description = item.description ?? ""
  if (room < 8) return head
  return `${head}  ${description.length > room ? `${description.slice(0, room - 1)}…` : description}`
}

/** `kaja pkg`'s checklist of skills, tools and MCP servers: space toggles, Enter submits, Esc cancels. */
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
    ...enabled.tools.map(name => optionValue({ type: "tool", name })),
    ...enabled.mcp.map(name => optionValue({ type: "mcp", name }))
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
            onSubmit={values => {
              const of = (type: PickerItem["type"]) =>
                values.filter(v => v.startsWith(`${type}:`)).map(v => v.slice(type.length + 1))
              onSubmit({ skills: of("skill"), tools: of("tool"), mcp: of("mcp") })
            }}
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
