import type { HttpToolScanEntry, McpScanEntry, PackageKeyNeed } from "@kaja/nasi"
import type { PackagesFile } from "@kaja/schema/config"
import type { PickerItem, PickerSelection } from "../components/package-picker"
import type { args as Args } from "../lib/cli/args"

/**
 * `kaja pkg` (checklist of skills, personas, HTTP tools and MCP servers → packages.toml, then any missing keys → secrets.toml) and
 * `kaja pkg update` (fetch + sync the marketplace), for local mode; a cloud user is pointed to the web instead. Runs
 * before the local/cloud branch like `config`: it never triggers cloud login.
 */
/** Where cloud users pick their packages (the web app's /packages page). */
const CLOUD_PACKAGES_URL = "https://kaja.io/packages"

export async function runPkgSubcommand(args: typeof Args) {
  const { t } = await import("../lib/i18n")
  const { runPkgUpdate } = await import("../lib/packages/cli")
  const { hasConfiguredChatModel } = await import("../lib/models/models")
  const [, sub] = args.input

  // Same mode rule as cli.ts. A cloud user's skills live in their account, so point them to the web instead of editing files that cloud chat never reads.
  const useLocal = args.flags.cloud ? false : args.flags.local || (await hasConfiguredChatModel())
  if (!useLocal) {
    console.log(t("pkg.cloudHint", { url: CLOUD_PACKAGES_URL }))
    process.exit(0)
  }

  if (sub === "update") {
    const { code, text } = await runPkgUpdate()
    console.log(text)
    process.exit(code)
  }
  if (sub !== undefined) {
    console.log(t("pkg.usage"))
    process.exit(1)
  }

  const { getMarketplaceDir, getPackagesPath, loadPackagesFile, savePackagesFile } = await import(
    "../lib/packages/packages-file"
  )
  const { readSyncLock } = await import("../lib/packages/sync")
  const marketplaceDir = getMarketplaceDir()

  // First use: fetch once so there's something to pick from. A failure still opens the picker with your own packages.
  if (!(await readSyncLock(marketplaceDir))) {
    console.log(t("pkg.firstSync"))
    console.log((await runPkgUpdate()).text)
  }

  const { skills, personas, tools, mcp, toolScan, mcpScan } = await scanMarketplace(marketplaceDir)
  const items = [...skills, ...personas, ...tools, ...mcp]
  const enabled = await loadPackagesFile()

  if (!process.stdin.isTTY) {
    printPackages(items, enabled)
    console.log(t("pkg.notTty", { path: getPackagesPath() }))
    process.exit(0)
  }

  const picked = await pickPackages(items, enabled)
  if (!picked) {
    console.log(t("pkg.cancelled"))
    process.exit(0)
  }
  // Enabled packages that are present but currently broken aren't selectable; keep them on rather than silently dropping them.
  const keepBroken = (names: string[], found: { name: string; error?: string }[]) =>
    names.filter(name => found.some(item => item.name === name && item.error))

  const next = {
    skills: [...picked.skills, ...keepBroken(enabled.skills, skills)],
    personas: [...picked.personas, ...keepBroken(enabled.personas, personas)],
    tools: [...picked.tools, ...keepBroken(enabled.tools, tools)],
    mcp: [...(await confirmStdioServers(picked.mcp, mcpScan, enabled.mcp)), ...keepBroken(enabled.mcp, mcp)]
  }
  await savePackagesFile(next)
  const count = next.skills.length + next.personas.length + next.tools.length + next.mcp.length
  console.log(t("pkg.saved", { path: getPackagesPath(), count }))

  await askMissingKeys([
    ...toolScan.filter(s => next.tools.includes(s.name)),
    ...mcpScan.filter(s => next.mcp.includes(s.name))
  ])
  process.exit(0)
}

function keyNeed(auth?: PackageKeyNeed): PickerItem["key"] {
  if (!auth) return undefined
  return auth.optional ? "optional" : "required"
}

// Every package in the marketplace folder as a picker row; `local` marks the ones the sync didn't write.
async function scanMarketplace(marketplaceDir: string) {
  const { scanHttpTools, scanMcpPackages, scanPersonas, scanSkills } = await import("@kaja/nasi")
  const { DEFAULT_PERSONA_ID } = await import("../lib/personas/personas")
  const { readSyncLock } = await import("../lib/packages/sync")
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
  const mcpScan = await scanMcpPackages(marketplaceDir)
  const mcp = mcpScan.map(({ auth, command, transport: _, ...s }) => ({
    ...s,
    type: "mcp" as const,
    runs: command,
    key: keyNeed(auth),
    local: !synced.has(`mcp/${s.name}.toml`)
  }))
  return { skills, personas, tools, mcp, toolScan, mcpScan }
}

// Without a terminal to pick in: one `[x] type name` line per package.
function printPackages(items: PickerItem[], enabled: PackagesFile) {
  const on = { skill: enabled.skills, persona: enabled.personas, tool: enabled.tools, mcp: enabled.mcp }
  for (const item of items) {
    console.log(`${on[item.type].includes(item.name) ? "[x]" : "[ ]"} ${item.type.padEnd(7)} ${item.name}`)
  }
}

// The checklist; undefined when it was cancelled.
async function pickPackages(items: PickerItem[], enabled: PickerSelection): Promise<PickerSelection | undefined> {
  const { render } = await import("ink")
  const { PackagePicker } = await import("../components/package-picker")
  let picked: PickerSelection | undefined
  const picker = render(
    <PackagePicker
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

// A stdio server runs a command on this machine: newly enabling one asks once, showing exactly what it runs.
async function confirmStdioServers(picked: string[], scan: McpScanEntry[], wasEnabled: string[]): Promise<string[]> {
  const { t } = await import("../lib/i18n")
  const { askYesNo } = await import("../lib/doctor/prompt")
  const confirmed: string[] = []
  for (const name of picked) {
    const command = scan.find(s => s.name === name)?.command
    const ok =
      !command ||
      wasEnabled.includes(name) ||
      (await askYesNo(t("pkg.confirmStdio", { name, command }), t("pkg.enable"), t("pkg.dontEnable")))
    if (ok) confirmed.push(name)
  }
  return confirmed
}

// Ask for keys enabled packages still lack. A skipped required key keeps the package enabled but left out until it's set; an optional one just loads without.
async function askMissingKeys(keyed: (HttpToolScanEntry | McpScanEntry)[]) {
  const { t } = await import("../lib/i18n")
  const { askSecret } = await import("../lib/doctor/prompt")
  const { saveSecrets, secrets } = await import("../lib/config/secrets")
  const known = (await secrets()).packages
  for (const pkg of keyed) {
    if (!pkg.auth || known[pkg.name]) continue
    const where = `${pkg.auth.in} ${pkg.auth.name}`
    const key = await askSecret(
      t(pkg.auth.optional ? "pkg.optionalKeyPrompt" : "pkg.keyPrompt", { name: pkg.name, where })
    )
    if (key) {
      await saveSecrets({ packages: { [pkg.name]: { apiKey: key } } })
      console.log(t("pkg.keySaved", { name: pkg.name }))
    } else if (!pkg.auth.optional) {
      console.log(t("pkg.keySkipped", { name: pkg.name }))
    }
  }
}
