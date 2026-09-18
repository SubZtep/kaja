import type { args as Args } from "../lib/cli/args"

/**
 * `kaja pkg` (checklist of skills → packages.toml) and `kaja pkg update` (fetch + sync the
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

  const { scanSkills } = await import("@kaja/nasi")
  const { getMarketplaceDir, getPackagesPath, loadPackagesFile, savePackagesFile } = await import(
    "../lib/packages/packages-file"
  )
  const { readSyncLock } = await import("../lib/packages/sync")
  const marketplaceDir = getMarketplaceDir()

  // First use: fetch once so there's something to pick from. A failure still opens the picker with your own skills.
  if (!(await readSyncLock(marketplaceDir))) {
    console.log(t("pkg.firstSync"))
    console.log((await runPkgUpdate()).text)
  }

  const lock = await readSyncLock(marketplaceDir)
  const synced = new Set(Object.keys(lock?.files ?? {}).map(path => path.split("/").slice(0, 2).join("/")))
  const skills = (await scanSkills(marketplaceDir)).map(s => ({ ...s, local: !synced.has(`skills/${s.name}`) }))
  const { skills: enabled } = await loadPackagesFile()

  if (!process.stdin.isTTY) {
    for (const s of skills) console.log(`${enabled.includes(s.name) ? "[x]" : "[ ]"} ${s.name}`)
    console.log(t("pkg.notTty", { path: getPackagesPath() }))
    process.exit(0)
  }

  const { render } = await import("ink")
  const { PackagePicker } = await import("../components/package-picker")
  let picked: string[] | undefined
  const { unmount, waitUntilExit } = render(
    <PackagePicker
      skills={skills}
      enabled={enabled}
      onSubmit={names => {
        picked = names
        unmount()
      }}
      onCancel={() => unmount()}
    />
  )
  await waitUntilExit()

  if (!picked) {
    console.log(t("pkg.cancelled"))
    process.exit(0)
  }
  // Enabled skills that are present but currently broken aren't selectable; keep them on rather than silently dropping them.
  const broken = enabled.filter(name => skills.some(s => s.name === name && s.error))
  const next = [...picked, ...broken]
  await savePackagesFile({ skills: next })
  console.log(t("pkg.saved", { path: getPackagesPath(), count: next.length }))
  process.exit(0)
}
