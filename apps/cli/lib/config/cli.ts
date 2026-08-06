import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import { ModelsFileSchema, type ServicesFile } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { t } from "../i18n"
import { fetchModelsToml, getModelsPath } from "../models/models"
import { getConfigDir, saveFetchedChatModel } from "./config"
import { nextBackupPath } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"

/** Handles `kaja config <fetch|wipe>`; returns { code, text } instead of printing/exiting so tests can call it directly. Runs before the config guard since a fresh install has no settings.json yet. */
export async function runConfigCli(
  argv: string[],
  services: Partial<ServicesFile>
): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") {
    const apiUrl = services.api?.baseUrl
    if (!apiUrl) return { code: 1, text: t("config.apiUrlMissing") }
    // Prefer services.toml [api].token; fall back to env for local/dev.
    const token = services.api?.token ?? process.env.CONFIG_API_TOKEN
    try {
      const results = await Promise.all([fetchMcpToml(apiUrl, token), fetchModelsToml(apiUrl, token)])
      // Best-effort: an unparseable models.toml still counts as a successful fetch, just without an auto-selected chat model.
      try {
        const modelsFile = ModelsFileSchema.parse(TOML.parse(await file(getModelsPath()).text()))
        const chatEntry = modelsFile.models.find(m => m.task === "chat")
        const defaultProviderName = Object.entries(modelsFile.providers).find(([, p]) => p.default)?.[0]
        if (chatEntry) {
          await saveFetchedChatModel({ model: chatEntry.model, provider: chatEntry.provider ?? defaultProviderName })
        }
      } catch {}
      const lines = results.map(({ path, backedUpTo }) =>
        backedUpTo ? t("config.fetchedWithBackup", { path, backup: backedUpTo }) : t("config.fetched", { path })
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
