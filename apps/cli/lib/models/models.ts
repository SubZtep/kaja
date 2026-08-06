import { join } from "node:path"
import { type CliResolvedModel, type KajaModelsFile, ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// Written on first run: an example provider/model catalog, sourced from the same file that documents models.toml on the docs site.
import TEMPLATE from "../../../../docs/config/models.fireworks.toml" with { type: "text" }
import OLLAMA_TEMPLATE from "../../../../docs/config/models.ollama.toml" with { type: "text" }
import { config, getConfigDir } from "../config/config"
import { fetchTomlConfig } from "../config/fetch"
import { t } from "../i18n"

export function getModelsPath() {
  return join(getConfigDir(), "models.toml")
}

/** Writes the chosen example template, for the "configure my own provider" first-run choice. */
export async function writeModelsTemplate(which: "fireworks" | "ollama") {
  await write(file(getModelsPath()), which === "ollama" ? OLLAMA_TEMPLATE : TEMPLATE)
}

/**
 * The `kaja config fetch` subcommand: downloads the server-rendered
 * models.toml from the Kaja API and writes it to the local config dir. An
 * existing file is renamed to .bak (.bak2, .bak3, ...) rather than
 * overwritten in place, so a bad fetch is always recoverable.
 */
export async function fetchModelsToml(
  apiBaseUrl: string,
  token?: string
): Promise<{ path: string; backedUpTo?: string }> {
  return fetchTomlConfig(apiBaseUrl, "/config/models.toml", getModelsPath(), token)
}

/** Flatten each model entry with its provider's credentials. */
export function resolveModels(data: KajaModelsFile): CliResolvedModel[] {
  // The schema guarantees a default provider exists when any model omits one.
  const defaultEntry = Object.entries(data.providers).find(([, p]) => p.default)
  return data.models.map(model => {
    const providerName = model.provider ?? defaultEntry![0]
    const provider = data.providers[providerName]!
    return {
      model: model.model,
      task: model.task,
      baseUrl: provider.base_url,
      apiKey: provider.api_key,
      provider: providerName
    }
  })
}

/** Resolves a models.<task> entry to its provider's credentials via models.toml. Returns undefined only for the free-tier case (no provider); throws if provider is set but unknown. */
export function resolveModelFromConfig(
  data: KajaModelsFile,
  ref: { model: string; provider?: string },
  task: ModelTask
): CliResolvedModel | undefined {
  if (!ref.provider) return undefined
  const provider = data.providers[ref.provider]
  if (!provider) throw new Error(`models.toml has no [providers.${ref.provider}] table (named by settings.json)`)
  return { model: ref.model, task, baseUrl: provider.base_url, apiKey: provider.api_key, provider: ref.provider }
}

/** Loads models.toml. If missing and on the free chat tier, returns empty (no placeholder file written); otherwise writes+parses the example template. Invalid file: prints error and exits. */
export async function loadModelsFile(): Promise<KajaModelsFile> {
  const modelsPath = getModelsPath()
  const f = file(modelsPath)
  const exists = await f.exists()
  if (!exists) {
    const { models } = await config()
    const { chat, ...otherTasks } = models
    const isFreeChatOnly = !chat && Object.values(otherTasks).every(id => !id)
    if (isFreeChatOnly) return ModelsFileSchema.parse({})
    await write(f, TEMPLATE)
  }
  // Parse TEMPLATE directly rather than reading it back: a freshly written BunFile can report stale (empty) content on an immediate re-read.
  const text = exists ? await f.text() : TEMPLATE
  try {
    return ModelsFileSchema.parse(TOML.parse(text))
  } catch (error: any) {
    console.log(t("models.invalidAt", { path: modelsPath, message: error.message }))
    process.exit(1)
  }
}

/** {@link loadModelsFile}, flattened into every model with its provider's credentials. */
export async function loadModels(): Promise<CliResolvedModel[]> {
  return resolveModels(await loadModelsFile())
}
