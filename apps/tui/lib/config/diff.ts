import { join } from "node:path"
import { CommandsFileSchema } from "@kaja/schema/config"
import { deepEquals, file, TOML } from "bun"
import COMMANDS_TEMPLATE from "../../../../config/commands.toml" with { type: "text" }
import SECRETS_TEMPLATE from "../../../../config/secrets.toml" with { type: "text" }
import { t } from "../i18n"
import { getConfigDir } from "./config"

/**
 * Reports what `kaja config fetch` would change, one line per file (unchanged / new / would update), without writing
 * anything. models.toml is compared against what the online catalog would make of it, unless `offline`.
 */
export async function diffConfig(offline: boolean): Promise<string[]> {
  const files: Record<string, string> = { "commands.toml": COMMANDS_TEMPLATE, "secrets.toml": SECRETS_TEMPLATE }
  if (!offline) {
    const { refreshCatalog } = await import("../models/remote-catalog")
    await refreshCatalog()
    const { modelsTomlFromCatalog } = await import("../models/current")
    const models = await modelsTomlFromCatalog()
    if (typeof models === "string") files["models.toml"] = models
  }

  const lines: string[] = []
  for (const key of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
    const path = join(getConfigDir(), key)
    const f = file(path)
    if (!(await f.exists())) {
      lines.push(t("config.diffNew", { path }))
      continue
    }
    const existing = await f.text()
    lines.push(
      same(key, existing, files[key]!) ? t("config.diffUnchanged", { path }) : t("config.diffWouldUpdate", { path })
    )
  }
  return lines
}

// commands.toml: only the `safe` list is replaced, the user's `custom` is kept; models.toml: its content, not its comments
function same(key: string, existing: string, fetched: string): boolean {
  try {
    if (key === "commands.toml")
      return deepEquals(
        CommandsFileSchema.parse(TOML.parse(existing)).safe,
        CommandsFileSchema.parse(TOML.parse(fetched)).safe
      )
    if (key === "models.toml") return deepEquals(TOML.parse(existing), TOML.parse(fetched))
  } catch {
    // An unparseable file differs from anything fetch would write
  }
  return existing === fetched
}
