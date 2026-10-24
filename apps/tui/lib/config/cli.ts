import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { markdownToTerminal } from "../markdown/md-terminal"
import type { RefreshSkipped } from "../models/current"
import { listPaths } from "../paths"
import { getConfigDir } from "./config"

type FetchResult = { path: string; backedUpTo?: string; unchanged?: boolean }

const SKIPPED_KEY: Record<RefreshSkipped["skipped"], string> = {
  "no-catalog": "config.fetchModelsNoCatalog",
  "no-models": "config.fetchModelsNoFile",
  "no-catalog-providers": "config.fetchModelsOwnOnly"
}

function fetchResultLine(result: FetchResult | RefreshSkipped) {
  if ("skipped" in result) return statusLine("info", t(SKIPPED_KEY[result.skipped]))
  const { path, backedUpTo, unchanged } = result
  if (unchanged) return statusLine("info", t("config.fetchedUnchanged", { path }))
  if (backedUpTo) return statusLine("success", t("config.fetchedWithBackup", { path, backup: backedUpTo }))
  return statusLine("success", t("config.fetched", { path }))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Moves models.toml to the online catalog's current defaults for the providers it uses. */
async function runFetch(): Promise<{ code: number; text: string }> {
  try {
    const { refreshCatalog } = await import("../models/remote-catalog")
    await refreshCatalog()
    const { refreshModelsToml } = await import("../models/current")
    return { code: 0, text: fetchResultLine(await refreshModelsToml()) }
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

async function runDiff(): Promise<{ code: number; text: string }> {
  const { diffConfig } = await import("./diff")
  try {
    const lines = await diffConfig()
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
export type ConfigFlags = { headless?: boolean }

/**
 * Handles `kaja config <fetch|paths|diff|wizard|hooks>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[], flags: ConfigFlags = {}): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") return runFetch()
  if (command === "paths") return runPaths()
  if (command === "diff") return runDiff()
  if (command === "wizard") return runWizard(flags)
  if (command === "hooks") return runHooks(flags)

  return { code: 1, text: t("config.usage") }
}
