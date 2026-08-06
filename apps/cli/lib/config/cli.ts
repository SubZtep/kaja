import { existsSync } from "node:fs"
import { rename } from "node:fs/promises"
import { ModelsFileSchema, type ServicesFile } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { t } from "../i18n"
import { fetchModelsToml, getModelsPath } from "../models/models"
import { getConfigDir, saveFetchedChatModel } from "./config"
import { nextBackupPath } from "./fetch"
import { fetchMcpToml } from "./mcp-servers"
import { saveFetchedApiBaseUrl } from "./services"

/**
 * Handles the `kaja config <fetch|wipe>` subcommand. Returns the text to
 * print and the exit code instead of printing/exiting itself, so tests can
 * call it directly. Runs before the config guard (like memory/session/web): a
 * fresh install has no valid settings.json/services.toml yet, and fetching a
 * real models.toml/config is exactly how you'd fix that — so it must work
 * without either. --api-url substitutes for services.toml's [api] baseUrl
 * on the first run and gets persisted there; models.chat in settings.json
 * gets seeded from the first fetched chat model, so a single fetch is
 * enough to leave a fresh install fully bootable. `wipe` is the inverse: it
 * backs up and clears the whole config dir so the next run starts fresh.
 */
export async function runConfigCli(
  argv: string[],
  services: Partial<ServicesFile>,
  flags: { apiUrl?: string } = {}
): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") {
    const apiUrl = flags.apiUrl ?? services.api?.baseUrl
    if (!apiUrl) return { code: 1, text: t("config.apiUrlMissing") }
    // Prefer services.toml [api].token; fall back to env for local/dev.
    const token = services.api?.token ?? process.env.CONFIG_API_TOKEN
    try {
      const results = await Promise.all([fetchMcpToml(apiUrl, token), fetchModelsToml(apiUrl, token)])
      if (flags.apiUrl) await saveFetchedApiBaseUrl(flags.apiUrl)
      // Best-effort: an unparseable models.toml just means no chat model
      // gets auto-selected — still report the fetch itself as successful,
      // since both files were written.
      try {
        const modelsFile = ModelsFileSchema.parse(TOML.parse(await file(getModelsPath()).text()))
        const chatEntry = modelsFile.models.find(m => m.task === "chat")
        if (chatEntry) await saveFetchedChatModel({ model: chatEntry.model, provider: chatEntry.provider ?? "default" })
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
