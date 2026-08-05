import { join } from "node:path"
import { file, TOML, write } from "bun"
// Written on first run: an example provider/model catalog, sourced from the
// same file that documents models.toml on the docs site.
import TEMPLATE from "../../../../docs/config/models.fireworks.toml" with { type: "text" }
import OLLAMA_TEMPLATE from "../../../../docs/config/models.ollama.toml" with { type: "text" }
import { type KajaModelsFile, ModelsFileSchema, type ResolvedModel } from "../../schemas/models"
import { config, getConfigDir } from "../config/config"
import { fetchTomlConfig } from "../config/fetch"
import { t } from "../i18n"

// Mirrors lib/openai.ts's FREE_CHAT_MODEL_ID — duplicated rather than
// imported to avoid a cycle (openai.ts imports from this module and runs
// top-level client setup on import).
const FREE_CHAT_MODEL_ID = "kaja-free-chat"

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
export function resolveModels(data: KajaModelsFile): ResolvedModel[] {
  return data.models.map(model => {
    // The schema guarantees the referenced provider exists.
    const provider = data.providers[model.provider ?? "default"]!
    return {
      id: model.model,
      task: model.task,
      baseUrl: provider.base_url,
      apiKey: provider.api_key
    }
  })
}

/**
 * Looks up one `[[models]]` entry by its models.toml `id` (config.json's
 * models.<task> value), resolved with its provider's credentials. Returns
 * undefined if the id isn't in the file — callers report their own
 * "not configured" error since the message differs per feature.
 */
export function resolveModelById(data: KajaModelsFile, id: string): ResolvedModel | undefined {
  const model = data.models.find(m => m.id === id)
  if (!model) return undefined
  const provider = data.providers[model.provider ?? "default"]!
  return {
    id: model.model,
    task: model.task,
    baseUrl: provider.base_url,
    apiKey: provider.api_key
  }
}

/**
 * Load and parse the models file. Missing file: on the free hosted chat
 * tier (models.chat === FREE_CHAT_MODEL_ID and no other task configured)
 * there's nothing to look up, so this returns an empty file rather than
 * writing the Fireworks example template — that free-mode installs stay
 * free of a models.toml pointing at placeholder credentials. Any other
 * setup still gets the example template written and parsed. Invalid file:
 * prints the error and exits, same policy as {@link config}.
 */
export async function loadModelsFile(): Promise<KajaModelsFile> {
  const modelsPath = getModelsPath()
  const f = file(modelsPath)
  const exists = await f.exists()
  if (!exists) {
    const { models } = await config()
    const { chat, ...otherTasks } = models
    const isFreeChatOnly = chat === FREE_CHAT_MODEL_ID && Object.values(otherTasks).every(id => !id)
    if (isFreeChatOnly) return ModelsFileSchema.parse({})
    await write(f, TEMPLATE)
  }
  // Parse TEMPLATE directly rather than reading it back: a freshly written
  // BunFile can report stale (empty) content on an immediate re-read.
  const text = exists ? await f.text() : TEMPLATE
  try {
    return ModelsFileSchema.parse(TOML.parse(text))
  } catch (error: any) {
    console.log(t("models.invalidAt", { path: modelsPath, message: error.message }))
    process.exit(1)
  }
}

/** {@link loadModelsFile}, flattened into every model with its provider's credentials. */
export async function loadModels(): Promise<ResolvedModel[]> {
  return resolveModels(await loadModelsFile())
}
