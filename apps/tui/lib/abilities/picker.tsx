import type { AbilityKeyNeed, McpScanEntry } from "@kaja/nasi"
import type { PickerItem, PickerSelection } from "../../components/ability-picker"

/** Every ability on disk, grouped as picker rows, plus the raw scans the key/command prompts need. */
export type MarketplaceScan = Awaited<ReturnType<typeof scanMarketplace>>

function keyNeed(auth?: AbilityKeyNeed): PickerItem["key"] {
  if (!auth) return undefined
  return auth.optional ? "optional" : "required"
}

/** Every ability in the marketplace folder as a picker row; `local` marks the ones the sync didn't write. */
export async function scanMarketplace(marketplaceDir: string) {
  const { scanHttpTools, scanMcpAbilities, scanPersonas, scanSkills } = await import("@kaja/nasi")
  const { DEFAULT_PERSONA_ID } = await import("../personas/personas")
  const { readSyncLock } = await import("./sync")
  const lockedPaths = Object.keys((await readSyncLock(marketplaceDir))?.files ?? {})
  const synced = new Set(lockedPaths.map(path => path.split("/").slice(0, 2).join("/")))
  const skills = (await scanSkills(marketplaceDir)).map(s => ({
    ...s,
    type: "skill" as const,
    local: !synced.has(`skills/${s.name}`)
  }))
  // default always loads, so there's nothing to pick.
  const personas = (await scanPersonas(marketplaceDir))
    .filter(s => s.name !== DEFAULT_PERSONA_ID)
    .map(({ label, when: _, ...s }) => ({
      ...s,
      description: label,
      type: "persona" as const,
      local: !synced.has(`personas/${s.name}.toml`)
    }))
  const toolScan = await scanHttpTools(marketplaceDir)
  const tools = toolScan.map(({ auth, ...s }) => ({
    ...s,
    type: "tool" as const,
    key: keyNeed(auth),
    local: !synced.has(`tools/${s.name}.toml`)
  }))
  const mcpScan = await scanMcpAbilities(marketplaceDir)
  const mcp = mcpScan.map(({ auth, command, transport: _, ...s }) => ({
    ...s,
    type: "mcp" as const,
    runs: command,
    key: keyNeed(auth),
    local: !synced.has(`mcp/${s.name}.toml`)
  }))
  return { skills, personas, tools, mcp, toolScan, mcpScan }
}

/** Every ability row, in the order the picker shows them. */
export function allItems(scan: MarketplaceScan): PickerItem[] {
  return [...scan.skills, ...scan.personas, ...scan.tools, ...scan.mcp]
}

/**
 * The setup wizard's recommended starter set: everything that works with no key of its own and
 * without running anything on this machine. Skills and personas always qualify — they have no
 * credentials. A tool or MCP server qualifies when it needs no key or the key is optional.
 *
 * stdio MCP servers are deliberately excluded even when keyless: enabling one spawns a process
 * locally, which belongs behind {@link confirmStdioServers} in `kaja abilities`, not in a set the
 * user accepts with one keystroke. Broken entries are skipped — they can't load anyway.
 */
export function starterSelection(scan: MarketplaceScan): PickerSelection {
  const usable = <T extends { error?: string }>(items: T[]) => items.filter(item => !item.error)
  return {
    skills: usable(scan.skills).map(s => s.name),
    personas: usable(scan.personas).map(s => s.name),
    tools: usable(scan.tools)
      .filter(s => s.key !== "required")
      .map(s => s.name),
    mcp: usable(scan.mcp)
      .filter(s => s.key !== "required" && !s.runs)
      .map(s => s.name)
  }
}

/** The checklist; undefined when it was cancelled. */
export async function pickAbilities(
  items: PickerItem[],
  enabled: PickerSelection
): Promise<PickerSelection | undefined> {
  const { render } = await import("ink")
  const { AbilityPicker } = await import("../../components/ability-picker")
  let picked: PickerSelection | undefined
  const picker = render(
    <AbilityPicker
      items={items}
      enabled={enabled}
      onSubmit={selection => {
        picked = selection
        picker.unmount()
      }}
      onCancel={() => picker.unmount()}
    />
  )
  await picker.waitUntilExit()
  return picked
}

/** A stdio server runs a command on this machine: newly enabling one asks once, showing exactly what it runs. */
export async function confirmStdioServers(
  picked: string[],
  scan: McpScanEntry[],
  wasEnabled: string[]
): Promise<string[]> {
  const { t } = await import("../i18n")
  const { askYesNo } = await import("../doctor/prompt")
  const confirmed: string[] = []
  for (const name of picked) {
    const command = scan.find(s => s.name === name)?.command
    const ok =
      !command ||
      wasEnabled.includes(name) ||
      (await askYesNo(t("ability.confirmStdio", { name, command }), t("ability.enable"), t("ability.dontEnable")))
    if (ok) confirmed.push(name)
  }
  return confirmed
}

/** Syncs the marketplace the first time, so there is something to choose from. A failure is reported and leaves whatever is already on disk. */
export async function ensureMarketplace(print: (line: string) => void): Promise<void> {
  const { getMarketplaceDir } = await import("./abilities-file")
  const { readSyncLock } = await import("./sync")
  if (await readSyncLock(getMarketplaceDir())) return

  const { t } = await import("../i18n")
  const { runAbilityUpdate } = await import("./cli")
  print(t("ability.firstSync"))
  print((await runAbilityUpdate()).text)
}
