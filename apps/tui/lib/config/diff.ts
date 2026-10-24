import { deepEquals, file, TOML } from "bun"
import { t } from "../i18n"
import { getModelsPath } from "../models/models"

/**
 * Reports what `kaja config fetch` would do to models.toml (unchanged / would update), without writing anything; an
 * info line instead when it would do nothing.
 */
export async function diffConfig(): Promise<string[]> {
  const { refreshCatalog } = await import("../models/modelsdev")
  await refreshCatalog()
  const { modelsTomlFromCatalog } = await import("../models/current")
  const next = await modelsTomlFromCatalog()
  if (typeof next !== "string") return [t(SKIPPED_KEY[next.skipped])]

  const path = getModelsPath()
  const existing = await file(path).text()
  // Content, not comments
  let same = existing === next
  try {
    same = deepEquals(TOML.parse(existing), TOML.parse(next))
  } catch {
    // an unparseable file differs from anything fetch would write
  }
  return [t(same ? "config.diffUnchanged" : "config.diffWouldUpdate", { path })]
}

const SKIPPED_KEY = {
  "no-catalog": "config.fetchModelsNoCatalog",
  "no-models": "config.fetchModelsNoFile",
  "no-catalog-providers": "config.fetchModelsOwnOnly"
} as const
