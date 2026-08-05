import { file, TOML } from "bun"
import { ModelsFileSchema } from "../../schemas/models"
import type { ServicesFile } from "../../schemas/services"
import { t } from "../i18n"
import { fetchModelsToml, getModelsPath } from "../models/models"
import { saveFetchedChatModel } from "./config"
import { fetchMcpToml } from "./mcp-servers"
import { saveFetchedApiBaseUrl } from "./services"

/**
 * Handles the `kaja config <fetch>` subcommand. Returns the text to print
 * and the exit code instead of printing/exiting itself, so tests can call
 * it directly. Runs before the config guard (like memory/session/web): a
 * fresh install has no valid config.json/services.toml yet, and fetching a
 * real models.toml/config is exactly how you'd fix that — so it must work
 * without either. --api-url substitutes for services.toml's [api] baseUrl
 * on the first run and gets persisted there; models.chat in config.json
 * gets seeded from the first fetched chat model, so a single fetch is
 * enough to leave a fresh install fully bootable.
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
        const chatModelId = modelsFile.models.find(m => m.task === "chat")?.id
        if (chatModelId) await saveFetchedChatModel(chatModelId)
      } catch {}
      const lines = results.map(({ path, backedUpTo }) =>
        backedUpTo ? t("config.fetchedWithBackup", { path, backup: backedUpTo }) : t("config.fetched", { path })
      )
      return { code: 0, text: lines.join("\n") }
    } catch (error: any) {
      return { code: 1, text: error?.message ?? String(error) }
    }
  }

  return { code: 1, text: t("config.usage") }
}
