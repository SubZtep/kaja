import { existsSync } from "node:fs"
import { join } from "node:path"
import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { markdownToTerminal } from "../markdown/md-terminal"
import { fetchModelsToml, getModelsPath } from "../models/models"
import { listPaths } from "../paths"
import { getConfigDir } from "./config"
import { writeTemplateConfig } from "./fetch"
import { fetchRemoteConfigBundle } from "./remote-fetch"
import { fetchSecretsToml } from "./secrets"

type FetchResult = { path: string; backedUpTo?: string; unchanged?: boolean; kept?: boolean }

const BUNDLE_FILES = new Set(["models.toml"])

/** The server bundle's files that `fetch` writes; personas and MCP servers, like the rest of the marketplace, come from `kaja abilities update`. */
export function pickBundleFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([key]) => BUNDLE_FILES.has(key)))
}

function fetchResultLine({ path, backedUpTo, unchanged, kept }: FetchResult) {
  if (kept) return statusLine("info", t("config.fetchedKept", { path }))
  if (unchanged) return statusLine("info", t("config.fetchedUnchanged", { path }))
  if (backedUpTo) return statusLine("success", t("config.fetchedWithBackup", { path, backup: backedUpTo }))
  return statusLine("success", t("config.fetched", { path }))
}

/** Maps a bundle file key ("models.toml") to its on-disk path under the config dir. */
export function pathForBundleKey(key: string): string {
  return join(getConfigDir(), key)
}

function matchesOnly(key: string, only: string | undefined): boolean {
  if (!only) return true
  if (only === "models") return key === "models.toml"
  if (only === "secrets") return key === "secrets.toml"
  return true
}

async function runFetchOffline(only?: string): Promise<FetchResult[]> {
  const results: FetchResult[] = []
  if (matchesOnly("models.toml", only)) results.push(await fetchModelsToml())
  if (matchesOnly("secrets.toml", only)) results.push(await fetchSecretsToml())
  return results
}

async function runFetchOnline(only: string | undefined): Promise<FetchResult[] | undefined> {
  // A 304 only means "same as the last download", not "same as what's on disk", so with no models.toml (the one file the bundle writes) ask for the full body. Not the config dir: fetching secrets.toml has just created it.
  const bundle = await fetchRemoteConfigBundle(existsSync(getModelsPath()))
  if ("unchanged" in bundle) return undefined

  const entries = Object.entries(pickBundleFiles(bundle.files)).filter(([key]) => matchesOnly(key, only))
  return Promise.all(entries.map(([key, text]) => writeTemplateConfig(text, pathForBundleKey(key))))
}

async function runFetch({ offline, only }: ConfigFlags): Promise<{ code: number; text: string }> {
  if (offline) {
    try {
      const results = await runFetchOffline(only)
      return { code: 0, text: results.map(fetchResultLine).join("\n") }
    } catch (error: any) {
      return { code: 1, text: error?.message ?? String(error) }
    }
  }

  try {
    // secrets.toml is never admin-managed (no user secrets on the server), so it's always fetched
    // from the bundled local template rather than the remote bundle. Done before runFetchOnline:
    // that call may read secrets(), which auto-writes a missing
    // secrets.toml as a side effect — fetching it explicitly first keeps this status line accurate.
    const secretsResult = matchesOnly("secrets.toml", only) ? [await fetchSecretsToml()] : []
    const remoteResults = await runFetchOnline(only)
    const results = [...secretsResult, ...(remoteResults ?? [])]
    if (results.length === 0) return { code: 0, text: statusLine("success", t("config.fetchAllUpToDate")) }
    return { code: 0, text: results.map(fetchResultLine).join("\n") }
  } catch (error: any) {
    console.log(statusLine("warning", t("config.fetchOfflineFallback", { message: error?.message ?? String(error) })))
    try {
      const results = await runFetchOffline(only)
      return { code: 0, text: results.map(fetchResultLine).join("\n") }
    } catch (fallbackError: any) {
      return { code: 1, text: fallbackError?.message ?? String(fallbackError) }
    }
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
  } catch (error: any) {
    return { code: 1, text: error?.message ?? String(error) }
  }
}

async function runWizard({ headless }: ConfigFlags): Promise<{ code: number; text: string }> {
  // No mode is forced here: `kaja config wizard` manages files only and must never start a cloud
  // login, so picking Cloud saves the preference and leaves signing in to the next bare `kaja`.
  const { runConfigWizard } = await import("../cli/config-wizard")
  return runConfigWizard({ headless })
}

/** The parsed flags these subcommands read. They come from `lib/cli/args.ts`, not from the positionals: parseArgs strips flags out of `input`, so scanning it here silently ignored every one of them. */
export type ConfigFlags = { headless?: boolean; offline?: boolean; only?: string }

/**
 * Handles `kaja config <fetch|paths|diff|wizard>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[], flags: ConfigFlags = {}): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") return runFetch(flags)
  if (command === "paths") return runPaths()
  if (command === "diff") return runDiff(flags)
  if (command === "wizard") return runWizard(flags)

  return { code: 1, text: t("config.usage") }
}
