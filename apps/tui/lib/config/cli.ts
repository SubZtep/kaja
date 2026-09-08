import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import { join } from "node:path"
import { t } from "../i18n"
import { markdownToTerminal } from "../markdown/md-terminal"
import { fetchModelsToml } from "../models/models"
import { listPaths } from "../paths"
import { fetchPersonasToml } from "../personas/fetch"
import { getConfigDir } from "./config"
import { nextBackupPath, writeTemplateConfig } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"
import { fetchRemoteConfigBundle } from "./remote-fetch"

type FetchResult = { path: string; backedUpTo?: string; unchanged?: boolean }

function fetchResultLine({ path, backedUpTo, unchanged }: FetchResult) {
  if (unchanged) return t("config.fetchedUnchanged", { path })
  if (backedUpTo) return t("config.fetchedWithBackup", { path, backup: backedUpTo })
  return t("config.fetched", { path })
}

/** Maps a bundle file key ("models.toml", "mcp.toml", "personas/<id>.toml") to its on-disk path under the config dir. */
export function pathForBundleKey(key: string): string {
  return join(getConfigDir(), key)
}

export function matchesOnly(key: string, only: string | undefined): boolean {
  if (!only) return true
  if (only === "models") return key === "models.toml"
  if (only === "mcp") return key === "mcp.toml"
  if (only === "personas") return key.startsWith("personas/")
  return true
}

async function runFetchOffline(only?: string): Promise<FetchResult[]> {
  const results: FetchResult[] = []
  if (matchesOnly("mcp.toml", only)) results.push(await fetchMcpToml())
  if (matchesOnly("models.toml", only)) results.push(await fetchModelsToml())
  if (matchesOnly("personas/", only)) results.push(...(await fetchPersonasToml()))
  return results
}

async function runFetchOnline(only: string | undefined): Promise<FetchResult[] | undefined> {
  const bundle = await fetchRemoteConfigBundle()
  if ("unchanged" in bundle) return undefined

  const entries = Object.entries(bundle.files).filter(([key]) => matchesOnly(key, only))
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
    const results = await runFetchOnline(only)
    if (!results) return { code: 0, text: t("config.fetchAllUpToDate") }
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

async function runWipe(): Promise<{ code: number; text: string }> {
  const dir = getConfigDir()
  if (!existsSync(dir)) return { code: 0, text: t("config.wipeNothing", { path: dir }) }
  const backup = await nextBackupPath(dir)
  await rename(dir, backup)
  return { code: 0, text: t("config.wiped", { path: dir, backup }) }
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
 * Handles `kaja config <fetch|wipe|paths|diff|wizard>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[]): Promise<{ code: number; text: string }> {
  const [command, ...rest] = argv

  if (command === "fetch") return runFetch(rest)
  if (command === "wipe") return runWipe()
  if (command === "paths") return runPaths()
  if (command === "diff") return runDiff(rest)
  if (command === "wizard") return runWizard(rest)

  return { code: 1, text: t("config.usage") }
}
