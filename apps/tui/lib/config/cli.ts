import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import { t } from "../i18n"
import { fetchModelsToml } from "../models/models"
import { listPaths } from "../paths"
import { fetchPersonasToml } from "../personas/fetch"
import { getConfigDir } from "./config"
import { nextBackupPath } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"

function fetchResultLine({ path, backedUpTo, unchanged }: { path: string; backedUpTo?: string; unchanged?: boolean }) {
  if (unchanged) return t("config.fetchedUnchanged", { path })
  if (backedUpTo) return t("config.fetchedWithBackup", { path, backup: backedUpTo })
  return t("config.fetched", { path })
}

async function runFetch(): Promise<{ code: number; text: string }> {
  try {
    const [mcpResult, modelsResult, personasResults] = await Promise.all([
      fetchMcpToml(),
      fetchModelsToml(),
      fetchPersonasToml()
    ])
    const results = [mcpResult, modelsResult, ...personasResults]
    return { code: 0, text: results.map(fetchResultLine).join("\n") }
  } catch (error: any) {
    return { code: 1, text: error?.message ?? String(error) }
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
  const text = listPaths(true, getConfigDir())
    .map(({ label, path }) => `${label}: ${path}`)
    .join("\n")
  return { code: 0, text }
}

/**
 * Handles `kaja config <fetch|wipe|paths>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[]): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") return runFetch()
  if (command === "wipe") return runWipe()
  if (command === "paths") return runPaths()

  return { code: 1, text: t("config.usage") }
}
