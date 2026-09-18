import type { args as Args } from "../lib/cli/args"

/**
 * `kaja pkg` (checklist of skills and HTTP tools → packages.toml, then any missing tool keys → secrets.toml) and `kaja pkg update` (fetch + sync the
 * marketplace). Runs before the local/cloud branch like `config`: it only touches local
 * files and must never trigger cloud login.
 */
export async function runPkgSubcommand(args: typeof Args) {
  const { t } = await import("../lib/i18n")
  const { runPkgUpdate } = await import("../lib/packages/cli")
  const [, sub] = args.input

  if (sub === "update") {
    const { code, text } = await runPkgUpdate()
    console.log(text)
    process.exit(code)
  }
  if (sub !== undefined) {
    console.log(t("pkg.usage"))
    process.exit(1)
  }

  const { scanHttpTools, scanMcpPackages, scanSkills } = await import("@kaja/nasi")
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

  const lockedPaths = Object.keys((await readSyncLock(marketplaceDir))?.files ?? {})
  const synced = new Set(lockedPaths.map(path => path.split("/").slice(0, 2).join("/")))
  const skills = (await scanSkills(marketplaceDir)).map(s => ({
    ...s,
    type: "skill" as const,
    local: !synced.has(`skills/${s.name}`)
  }))
  const keyNeed = (auth?: { optional: boolean }): "optional" | "required" | undefined =>
    auth ? (auth.optional ? "optional" : "required") : undefined
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
  const items = [...skills, ...tools, ...mcp]
  const enabled = await loadPackagesFile()

  if (!process.stdin.isTTY) {
    for (const item of skills) console.log(`${enabled.skills.includes(item.name) ? "[x]" : "[ ]"} skill ${item.name}`)
    for (const item of tools) console.log(`${enabled.tools.includes(item.name) ? "[x]" : "[ ]"} tool  ${item.name}`)
    for (const item of mcp) console.log(`${enabled.mcp.includes(item.name) ? "[x]" : "[ ]"} mcp   ${item.name}`)
    console.log(t("pkg.notTty", { path: getPackagesPath() }))
    process.exit(0)
  }

  const { render } = await import("ink")
  const { PackagePicker } = await import("../components/package-picker")
  let picked: { skills: string[]; tools: string[]; mcp: string[] } | undefined
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

  if (!picked) {
    console.log(t("pkg.cancelled"))
    process.exit(0)
  }
  // Enabled packages that are present but currently broken aren't selectable; keep them on rather than silently dropping them.
  const keepBroken = (names: string[], found: { name: string; error?: string }[]) =>
    names.filter(name => found.some(item => item.name === name && item.error))
  const { askSecret, askYesNo } = await import("../lib/doctor/prompt")

  // A stdio server runs a command on this machine: newly enabling one asks once, showing exactly what it runs.
  const confirmedMcp: string[] = []
  for (const name of picked.mcp) {
    const command = mcpScan.find(s => s.name === name)?.command
    const confirmed =
      !command ||
      enabled.mcp.includes(name) ||
      (await askYesNo(t("pkg.confirmStdio", { name, command }), t("pkg.enable"), t("pkg.dontEnable")))
    if (confirmed) confirmedMcp.push(name)
  }

  const next = {
    skills: [...picked.skills, ...keepBroken(enabled.skills, skills)],
    tools: [...picked.tools, ...keepBroken(enabled.tools, tools)],
    mcp: [...confirmedMcp, ...keepBroken(enabled.mcp, mcp)]
  }
  await savePackagesFile(next)
  const count = next.skills.length + next.tools.length + next.mcp.length
  console.log(t("pkg.saved", { path: getPackagesPath(), count }))

  // Ask for keys enabled packages still lack. A skipped required key keeps the package enabled but left out until it's set; an optional one just loads without.
  const { saveSecrets, secrets } = await import("../lib/config/secrets")
  const known = (await secrets()).packages
  const keyed = [
    ...toolScan.filter(s => next.tools.includes(s.name)),
    ...mcpScan.filter(s => next.mcp.includes(s.name))
  ]
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
  process.exit(0)
}
