import type { AbilitiesFile } from "@kaja/schema/config"
import type { PickerItem } from "../components/ability-picker"
import {
  allItems,
  confirmStdioServers,
  ensureMarketplace,
  pickAbilities,
  scanMarketplace
} from "../lib/abilities/picker"
import type { args as Args } from "../lib/cli/args"

/**
 * `kaja abilities` (checklist of skills, personas, HTTP tools and MCP servers → abilities.toml, then any missing keys, tested and saved to secrets.toml) and
 * `kaja abilities update` (fetch + sync the marketplace), for local mode; a cloud user is pointed to the web instead. Runs
 * before the local/cloud branch like `config`: it never triggers cloud login.
 */
/** Where cloud users pick their abilities (the web app's /abilities page). */
const CLOUD_ABILITIES_URL = "https://kaja.io/abilities"

export async function runAbilitiesSubcommand(args: typeof Args) {
  const { t } = await import("../lib/i18n")
  const { statusLine } = await import("../lib/doctor/status")
  const { runAbilityUpdate, UPDATE_STEPS } = await import("../lib/abilities/cli")
  const { resolveMode } = await import("../lib/config/mode")
  const [, sub] = args.input

  // Same mode rule as cli.ts. A cloud user's skills live in their account, so point them to the web instead of editing files that cloud chat never reads.
  if ((await resolveMode(args.flags)) === "cloud") {
    console.log(t("ability.cloudHint", { url: CLOUD_ABILITIES_URL }))
    process.exit(0)
  }

  // Before the progress bar or picker renders: "auto" asks the terminal over stdin
  const { resolveConsoleTheme } = await import("../lib/terminal-background")
  await resolveConsoleTheme()

  if (sub === "update") {
    const { withStepProgress } = await import("../lib/abilities/progress")
    const { code, text } = await withStepProgress(t("ability.updating"), UPDATE_STEPS, runAbilityUpdate)
    console.log(text)
    process.exit(code)
  }
  if (sub !== undefined) {
    console.log(t("ability.usage"))
    process.exit(1)
  }

  const { getMarketplaceDir, getAbilitiesPath, loadAbilitiesFile, saveAbilitiesFile } = await import(
    "../lib/abilities/abilities-file"
  )

  // First use: fetch once so there's something to pick from. A failure still opens the picker with your own abilities.
  await ensureMarketplace(line => console.log(line))

  const scan = await scanMarketplace(getMarketplaceDir())
  const { skills, personas, tools, mcp, toolScan, mcpScan } = scan
  const items = allItems(scan)
  const enabled = await loadAbilitiesFile()

  if (!process.stdin.isTTY) {
    printAbilities(items, enabled)
    console.log(statusLine("warning", t("ability.notTty", { path: getAbilitiesPath() })))
    process.exit(0)
  }

  const picked = await pickAbilities(items, enabled)
  if (!picked) {
    console.log(statusLine("info", t("ability.cancelled")))
    process.exit(0)
  }
  // Enabled abilities that are present but currently broken aren't selectable; keep them on rather than silently dropping them.
  const keepBroken = (names: string[], found: { name: string; error?: string }[]) =>
    names.filter(name => found.some(item => item.name === name && item.error))

  const next = {
    skills: [...picked.skills, ...keepBroken(enabled.skills, skills)],
    personas: [...picked.personas, ...keepBroken(enabled.personas, personas)],
    tools: [...picked.tools, ...keepBroken(enabled.tools, tools)],
    mcp: [...(await confirmStdioServers(picked.mcp, mcpScan, enabled.mcp)), ...keepBroken(enabled.mcp, mcp)]
  }
  await saveAbilitiesFile(next)
  const count = next.skills.length + next.personas.length + next.tools.length + next.mcp.length
  console.log(statusLine("success", t("ability.saved", { path: getAbilitiesPath(), count })))

  // Only the keys still missing for what is now enabled: the rest were set earlier and aren't this command's business.
  const { secrets } = await import("../lib/config/secrets")
  const { abilityKeyWhere, runCredentialPass } = await import("../lib/doctor/credentials")
  const known = (await secrets()).abilities
  const keyed = [
    ...toolScan.filter(s => next.tools.includes(s.name)),
    ...mcpScan.filter(s => next.mcp.includes(s.name))
  ].filter(s => s.auth && !known[s.name])
  await runCredentialPass(
    line => console.log(line),
    undefined,
    [],
    {},
    {
      only: keyed.map(s => abilityKeyWhere(s.name)),
      askOptional: true
    }
  )
  process.exit(0)
}

// Without a terminal to pick in: one `[x] type name` line per ability.
function printAbilities(items: PickerItem[], enabled: AbilitiesFile) {
  const on = { skill: enabled.skills, persona: enabled.personas, tool: enabled.tools, mcp: enabled.mcp }
  for (const item of items) {
    console.log(`${on[item.type].includes(item.name) ? "[x]" : "[ ]"} ${item.type.padEnd(7)} ${item.name}`)
  }
}
