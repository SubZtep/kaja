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

  const { scanHttpTools, scanSkills } = await import("@kaja/nasi")
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
  const toolScan = await scanHttpTools(marketplaceDir)
  const tools = toolScan.map(({ auth, ...s }) => ({
    ...s,
    type: "tool" as const,
    needsKey: auth !== undefined,
    local: !synced.has(`tools/${s.name}.toml`)
  }))
  const items = [...skills, ...tools]
  const enabled = await loadPackagesFile()

  if (!process.stdin.isTTY) {
    for (const item of skills) console.log(`${enabled.skills.includes(item.name) ? "[x]" : "[ ]"} skill ${item.name}`)
    for (const item of tools) console.log(`${enabled.tools.includes(item.name) ? "[x]" : "[ ]"} tool  ${item.name}`)
    console.log(t("pkg.notTty", { path: getPackagesPath() }))
    process.exit(0)
  }

  const { render } = await import("ink")
  const { PackageKeyPrompt, PackagePicker } = await import("../components/package-picker")
  let picked: { skills: string[]; tools: string[] } | undefined
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
  const next = {
    skills: [...picked.skills, ...keepBroken(enabled.skills, skills)],
    tools: [...picked.tools, ...keepBroken(enabled.tools, tools)]
  }
  await savePackagesFile(next)
  console.log(t("pkg.saved", { path: getPackagesPath(), count: next.skills.length + next.tools.length }))

  // Ask for keys the enabled tools still lack; a skipped one stays enabled but is left out until its key is set.
  const { saveSecrets, secrets } = await import("../lib/config/secrets")
  const known = (await secrets()).packages
  for (const tool of toolScan) {
    if (!(next.tools.includes(tool.name) && tool.auth && !known[tool.name])) continue
    let key: string | undefined
    const prompt = render(
      <PackageKeyPrompt
        name={tool.name}
        where={`${tool.auth.in} ${tool.auth.name}`}
        onSubmit={value => {
          key = value
          prompt.unmount()
        }}
        onSkip={() => prompt.unmount()}
      />
    )
    await prompt.waitUntilExit()
    if (key) {
      await saveSecrets({ packages: { [tool.name]: { apiKey: key } } })
      console.log(t("pkg.keySaved", { name: tool.name }))
    } else {
      console.log(t("pkg.keySkipped", { name: tool.name }))
    }
  }
  process.exit(0)
}
