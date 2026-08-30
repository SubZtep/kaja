import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import { ModelsFileSchema, type SecretsFile, type ServicesFile } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { t } from "../i18n"
import { fetchModelsToml, getModelsPath, saveFetchedActiveChat } from "../models/models"
import { getConfigDir } from "./config"
import { nextBackupPath } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"

/**
 * Handles `kaja config <fetch|wipe>`;
 *
 * Returns `{ code, text }`
 */
export async function runConfigCli(
  argv: string[],
  services: Partial<ServicesFile>,
  secrets: Partial<SecretsFile>
): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") {
    const apiUrl = services.api?.baseUrl
    if (!apiUrl) return { code: 1, text: t("config.apiUrlMissing") }

    const token = secrets.api?.token ?? process.env.CONFIG_API_TOKEN

    try {
      const [mcpResult, modelsResult] = await Promise.all([fetchMcpToml(apiUrl, token), fetchModelsToml(apiUrl, token)])
      const results = [mcpResult, modelsResult]

      if (!modelsResult.unchanged) {
        try {
          const modelsFile = ModelsFileSchema.parse(TOML.parse(await file(getModelsPath()).text()))
          const chatEntry = Object.entries(modelsFile.models).find(([, m]) => m.task === "chat")
          if (chatEntry) {
            await saveFetchedActiveChat(chatEntry[0])
          }
        } catch {
          // console.log("Failed to save", modelsResult)
        }
      }

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
