import { join } from "node:path"
import type { PersonaModels } from "@kaja/schema/cli"
import { type CliResolvedModel, type KajaModelsFile, ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// Written on first run: an example provider/model catalog, sourced from the same file that documents models.toml on the docs site.
import TEMPLATE from "../../../../docs/config/models.fireworks.toml" with { type: "text" }
import OLLAMA_TEMPLATE from "../../../../docs/config/models.ollama.toml" with { type: "text" }
import { getConfigDir } from "../config/config"
import { fetchTomlConfig } from "../config/fetch"
import { secrets } from "../config/secrets"
import { t } from "../i18n"

/** models.toml's [providers.*], with secrets.toml's [providers.<name>].api_key folded back in. */
export type ResolvedModelsFile = Omit<KajaModelsFile, "providers"> & {
  providers: Record<string, KajaModelsFile["providers"][string] & { api_key?: string }>
}

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
 * overwritten in place, so a bad fetch is always recoverable. Carries the
 * existing [active].chat (if set) over into the fetched data before
 * comparing to disk, so a fetch that's otherwise identical to last time
 * doesn't count as "changed" just because an earlier fetch seeded
 * [active].chat locally.
 */
export async function fetchModelsToml(
  apiBaseUrl: string,
  token?: string
): Promise<{ path: string; backedUpTo?: string; unchanged?: boolean }> {
  return fetchTomlConfig(apiBaseUrl, "/config/models.toml", getModelsPath(), token, (fetched, existing) => {
    const existingActive = existing.active as Record<string, unknown> | undefined
    if (!existingActive?.chat) return fetched
    const active = (fetched.active as Record<string, unknown> | undefined) ?? {}
    if (active.chat) return fetched
    return { ...fetched, active: { ...active, chat: existingActive.chat } }
  })
}

/** Flatten each models.toml entry with its provider's credentials. */
export function resolveModels(data: ResolvedModelsFile): CliResolvedModel[] {
  return Object.entries(data.models).map(([id, entry]) => {
    const provider = data.providers[entry.provider]!
    return {
      id,
      model: entry.model,
      task: entry.task,
      baseUrl: provider.base_url,
      apiKey: provider.api_key,
      provider: entry.provider
    }
  })
}

/**
 * Looks up a models.toml id among resolved models, optionally constrained to a task.
 *
 * Returns CliResolvedModel, or `undefined` if not found
 */
export function findModelById(
  models: CliResolvedModel[],
  id: string | undefined,
  task?: ModelTask
): CliResolvedModel | undefined {
  if (!id) return undefined
  return models.find(m => m.id === id && (!task || m.task === task))
}

/** Resolves the model to use for a task: a persona's pin for that task wins */
export function resolveActiveModel(
  data: ResolvedModelsFile,
  task: ModelTask,
  personaModels?: PersonaModels
): CliResolvedModel | undefined {
  const models = resolveModels(data)
  const pinned = findModelById(models, personaModels?.[task], task)
  if (pinned) return pinned
  return findModelById(models, data.active[task], task)
}

/**
 * Loads models.toml, then folds in secrets.toml's [providers.<name>].api_key.
 *
 * Missing file: no models (free-tier chat, everything else "not configured").
 *
 * Invalid file: prints error and exits.
 */
export async function loadModelsFile(): Promise<ResolvedModelsFile> {
  const modelsPath = getModelsPath()
  const f = file(modelsPath)
  if (!(await f.exists())) return ModelsFileSchema.parse({})
  const text = await f.text()
  try {
    const parsed = ModelsFileSchema.parse(TOML.parse(text))
    const { providers: providerSecrets } = await secrets()
    const providers = Object.fromEntries(
      Object.entries(parsed.providers).map(([name, provider]) => [
        name,
        { ...provider, api_key: providerSecrets[name]?.api_key }
      ])
    )
    return { ...parsed, providers }
  } catch (error: any) {
    console.log(t("models.invalidAt", { path: modelsPath, message: error.message }))
    process.exit(1)
  }
}

/** {@link loadModelsFile}, flattened into every model with its provider's credentials. */
export async function loadModels(): Promise<CliResolvedModel[]> {
  return resolveModels(await loadModelsFile())
}

/** Seeds a freshly fetched models.toml's [active].chat with a model id, only if unset. */
export async function saveFetchedActiveChat(chatId: string) {
  const modelsPath = getModelsPath()
  const f = file(modelsPath)
  if (!(await f.exists())) return
  const parsed = TOML.parse(await f.text()) as Record<string, unknown>
  const active = (parsed.active as Record<string, unknown> | undefined) ?? {}
  if (active.chat) return
  await write(modelsPath, TOML.stringify({ ...parsed, active: { ...active, chat: chatId } })!)
}
