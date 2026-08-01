import type { KajaConfig } from "../schemas/config"
import { t } from "./i18n"
import { fetchMcpToml } from "./mcp-servers"
import { fetchModelsToml } from "./models"

/**
 * Handles the `kaja config <fetch>` subcommand. Returns the text to print
 * and the exit code instead of printing/exiting itself, so tests can call
 * it directly. Runs after the config guard (unlike memory/session/web):
 * it needs config.api.baseUrl to know where to fetch from.
 */
export async function runConfigCli(argv: string[], config: KajaConfig): Promise<{ code: number; text: string }> {
  const [command] = argv

  if (command === "fetch") {
    if (!config.api?.baseUrl) return { code: 1, text: t("config.apiUrlMissing") }
    try {
      const results = await Promise.all([fetchMcpToml(config.api.baseUrl), fetchModelsToml(config.api.baseUrl)])
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
