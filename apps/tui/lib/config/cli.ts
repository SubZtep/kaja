import { existsSync } from "node:fs"
import { join } from "node:path"
import { t } from "../i18n"
import { markdownToTerminal } from "../markdown/md-terminal"
import { fetchModelsToml } from "../models/models"
import { listPaths } from "../paths"
import { getConfigDir } from "./config"
import { writeTemplateConfig } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"
import { fetchRemoteConfigBundle } from "./remote-fetch"
import { fetchSecretsToml } from "./secrets"

type FetchResult = { path: string; backedUpTo?: string; unchanged?: boolean }

const BUNDLE_FILES = new Set(["models.toml", "mcp.toml"])

/** The server bundle's files that `fetch` writes; personas, like the rest of the marketplace, come from `kaja pkg update`. */
export function pickBundleFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([key]) => BUNDLE_FILES.has(key)))
}

function fetchResultLine({ path, backedUpTo, unchanged }: FetchResult) {
  if (unchanged) return t("config.fetchedUnchanged", { path })
  if (backedUpTo) return t("config.fetchedWithBackup", { path, backup: backedUpTo })
  return t("config.fetched", { path })
}

/** Maps a bundle file key ("models.toml", "mcp.toml") to its on-disk path under the config dir. */
export function pathForBundleKey(key: string): string {
  return join(getConfigDir(), key)
}

function matchesOnly(key: string, only: string | undefined): boolean {
  if (!only) return true
  if (only === "models") return key === "models.toml"
  if (only === "mcp") return key === "mcp.toml"
  if (only === "secrets") return key === "secrets.toml"
  return true
}

async function runFetchOffline(only?: string): Promise<FetchResult[]> {
  const results: FetchResult[] = []
  if (matchesOnly("mcp.toml", only)) results.push(await fetchMcpToml())
  if (matchesOnly("models.toml", only)) results.push(await fetchModelsToml())
  if (matchesOnly("secrets.toml", only)) results.push(await fetchSecretsToml())
  return results
}

async function runFetchOnline(only: string | undefined): Promise<FetchResult[] | undefined> {
  // A 304 only means "same as the last download", not "same as what's on disk" — so when the config
  // dir is missing entirely (first run) ask for the full body instead of trusting it.
  const bundle = await fetchRemoteConfigBundle(existsSync(getConfigDir()))
  if ("unchanged" in bundle) return undefined

  const entries = Object.entries(pickBundleFiles(bundle.files)).filter(([key]) => matchesOnly(key, only))
  return Promise.all(entries.map(([key, text]) => writeTemplateConfig(text, pathForBundleKey(key))))
}

async function runFetch(argv: string[]): Promise<{ code: number; text: string }> {
  const offline = argv.includes("--offline")
  const onlyIndex = argv.indexOf("--only")
  const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : undefined

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
    // that call resolves the API base URL via services()/secrets(), which auto-writes a missing
    // secrets.toml as a side effect — fetching it explicitly first keeps this status line accurate.
    const secretsResult = matchesOnly("secrets.toml", only) ? [await fetchSecretsToml()] : []
    const remoteResults = await runFetchOnline(only)
    const results = [...secretsResult, ...(remoteResults ?? [])]
    if (results.length === 0) return { code: 0, text: t("config.fetchAllUpToDate") }
    return { code: 0, text: results.map(fetchResultLine).join("\n") }
  } catch (error: any) {
    console.log(t("config.fetchOfflineFallback", { message: error?.message ?? String(error) }))
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

async function runDiff(argv: string[]): Promise<{ code: number; text: string }> {
  const offline = argv.includes("--offline")
  const { diffConfig } = await import("./diff")
  try {
    const lines = await diffConfig(offline)
    return { code: 0, text: lines.join("\n") }
  } catch (error: any) {
    return { code: 1, text: error?.message ?? String(error) }
  }
}

async function runWizard(argv: string[]): Promise<{ code: number; text: string }> {
  const headless = argv.includes("--headless")
  const { runConfigWizard } = await import("../cli/config-wizard")
  return runConfigWizard(headless)
}

/**
 * Handles `kaja config <fetch|paths|diff|wizard>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[]): Promise<{ code: number; text: string }> {
  const [command, ...rest] = argv

  if (command === "fetch") return runFetch(rest)
  if (command === "paths") return runPaths()
  if (command === "diff") return runDiff(rest)
  if (command === "wizard") return runWizard(rest)

  return { code: 1, text: t("config.usage") }
}
