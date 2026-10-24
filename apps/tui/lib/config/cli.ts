import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { markdownToTerminal } from "../markdown/md-terminal"
import type { RefreshSkipped } from "../models/current"
import { listPaths } from "../paths"
import { fetchCommandsToml } from "./commands"
import { getConfigDir } from "./config"
import { fetchSecretsToml } from "./secrets"

type FetchResult = { path: string; backedUpTo?: string; unchanged?: boolean; kept?: boolean }

function fetchResultLine(result: FetchResult | RefreshSkipped) {
  if ("skipped" in result) return statusLine("info", t(SKIPPED_KEY[result.skipped]))
  const { path, backedUpTo, unchanged, kept } = result
  if (kept) return statusLine("info", t("config.fetchedKept", { path }))
  if (unchanged) return statusLine("info", t("config.fetchedUnchanged", { path }))
  if (backedUpTo) return statusLine("success", t("config.fetchedWithBackup", { path, backup: backedUpTo }))
  return statusLine("success", t("config.fetched", { path }))
}

const SKIPPED_KEY: Record<RefreshSkipped["skipped"], string> = {
  "no-catalog": "config.fetchModelsNoCatalog",
  "no-models": "config.fetchModelsNoFile",
  "no-catalog-providers": "config.fetchModelsOwnOnly"
}

function matchesOnly(key: string, only: string | undefined): boolean {
  if (!only) return true
  if (only === "models") return key === "models.toml"
  if (only === "secrets") return key === "secrets.toml"
  if (only === "commands") return key === "commands.toml"
  return true
}

/**
 * Models.toml follows the online catalog (`--offline` leaves it alone); secrets.toml and commands.toml come from the
 * templates this build carries.
 */
async function fetchModels(offline: boolean | undefined): Promise<FetchResult | RefreshSkipped> {
  if (offline) return { skipped: "no-catalog" }
  const { refreshCatalog } = await import("../models/remote-catalog")
  await refreshCatalog()
  const { refreshModelsToml } = await import("../models/current")
  return refreshModelsToml()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runFetch({ offline, only }: ConfigFlags): Promise<{ code: number; text: string }> {
  try {
    // secrets.toml first: reading the config later can write a missing one as a side effect, and this line should say so
    const results: (FetchResult | RefreshSkipped)[] = []
    if (matchesOnly("secrets.toml", only)) results.push(await fetchSecretsToml())
    if (matchesOnly("commands.toml", only)) results.push(await fetchCommandsToml())
    if (matchesOnly("models.toml", only)) results.push(await fetchModels(offline))
    return { code: 0, text: results.map(fetchResultLine).join("\n") }
  } catch (error) {
    return { code: 1, text: errorMessage(error) }
  }
}

function runPaths(): { code: number; text: string } {
  const rows = listPaths(true, getConfigDir())
    .map(({ label, path }) => `| ${label} | ${path} |`)
    .join("\n")
  const md = `| Config | Path |\n| :--- | :--- |\n${rows}`
  return { code: 0, text: markdownToTerminal(md) }
}

async function runDiff({ offline }: ConfigFlags): Promise<{ code: number; text: string }> {
  const { diffConfig } = await import("./diff")
  try {
    const lines = await diffConfig(Boolean(offline))
    return { code: 0, text: lines.join("\n") }
  } catch (error) {
    return { code: 1, text: errorMessage(error) }
  }
}

async function runWizard({ headless }: ConfigFlags): Promise<{ code: number; text: string }> {
  // No mode is forced here: `kaja config wizard` manages files only and must never start a cloud
  // login, so picking Cloud saves the preference and leaves signing in to the next bare `kaja`.
  const { runConfigWizard } = await import("../cli/config-wizard")
  return runConfigWizard({ headless })
}

async function runHooks({ headless }: ConfigFlags): Promise<{ code: number; text: string }> {
  if (headless || !process.stdin.isTTY || !process.stdout.isTTY) return { code: 1, text: t("hooks.needsTerminal") }
  const { resolveConsoleTheme } = await import("../terminal-background")
  await resolveConsoleTheme()
  const { offerHooks } = await import("../hooks/offer")
  await offerHooks(line => console.log(line))
  return { code: 0, text: t("hooks.done") }
}

/**
 * The parsed flags these subcommands read. They come from `lib/cli/args.ts`, not from the positionals: parseArgs strips
 * flags out of `input`, so scanning it here silently ignored every one of them.
 */
export type ConfigFlags = { headless?: boolean; offline?: boolean; only?: string }

/**
 * Handles `kaja config <fetch|paths|diff|wizard|hooks>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[], flags: ConfigFlags = {}): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") return runFetch(flags)
  if (command === "paths") return runPaths()
  if (command === "diff") return runDiff(flags)
  if (command === "wizard") return runWizard(flags)
  if (command === "hooks") return runHooks(flags)

  return { code: 1, text: t("config.usage") }
}
