import type { args as Args } from "../lib/cli/args"

/**
 * `kaja abilities` (a read-only list: each ability's parts, its key, and the personas that use it) and
 * `kaja abilities update` (fetch + sync the marketplace), for local mode; a cloud user only gets a hint.
 * Runs before the local/cloud branch like `config`: it never triggers cloud login.
 */
export async function runAbilitiesSubcommand(args: typeof Args) {
  const { t } = await import("../lib/i18n")
  const { runAbilityUpdate, UPDATE_STEPS, ensureMarketplace } = await import("../lib/abilities/cli")
  const { resolveMode } = await import("../lib/config/mode")
  const [, sub] = args.input

  // Same mode rule as cli.ts. Cloud chat never reads the local files, so there's nothing to list here.
  if ((await resolveMode(args.flags)) === "cloud") {
    console.log(t("ability.cloudHint"))
    process.exit(0)
  }

  // Before the progress bar renders: "auto" asks the terminal over stdin
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

  // First use: fetch once so there's something to list. A failure still lists your own abilities.
  await ensureMarketplace(line => console.log(line))
  const { abilityListLines } = await import("../lib/abilities/list")
  for (const line of await abilityListLines()) console.log(line)
  process.exit(0)
}
