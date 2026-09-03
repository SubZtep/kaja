import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import { t } from "../i18n"
import { fetchModelsToml } from "../models/models"
import { fetchPersonasToml } from "../personas/fetch"
import { getConfigDir } from "./config"
import { nextBackupPath } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"

/**
 * Handles `kaja config <fetch|wipe>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(argv: string[]): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") {
    try {
      const [mcpResult, modelsResult, personasResults] = await Promise.all([
        fetchMcpToml(),
        fetchModelsToml(),
        fetchPersonasToml()
      ])
      const results = [mcpResult, modelsResult, ...personasResults]

      const lines = results.map(({ path, backedUpTo, unchanged }) =>
        unchanged
          ? t("config.fetchedUnchanged", { path })
          : backedUpTo
            ? t("config.fetchedWithBackup", { path, backup: backedUpTo })
            : t("config.fetched", { path })
      )
      return { code: 0, text: lines.join("\n") }
    } catch (error: any) {
      return { code: 1, text: error?.message ?? String(error) }
    }
  }

  if (command === "wipe") {
    const dir = getConfigDir()
    if (!existsSync(dir)) return { code: 0, text: t("config.wipeNothing", { path: dir }) }
    const backup = await nextBackupPath(dir)
    await rename(dir, backup)
    return { code: 0, text: t("config.wiped", { path: dir, backup }) }
  }

  return { code: 1, text: t("config.usage") }
}
