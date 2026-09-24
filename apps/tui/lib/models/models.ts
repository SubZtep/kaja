import { join } from "node:path"
import type { PersonaModels } from "@kaja/schema/cli"
import { type CliResolvedModel, type KajaModelsFile, ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// What `kaja config fetch --offline` writes: the default example generated from docs/config/catalog.toml.
import TEMPLATE from "../../../../docs/config/models.default.toml" with { type: "text" }
import { getConfigDir } from "../config/config"
import { writeTemplateConfig } from "../config/fetch"
import { secrets } from "../config/secrets"
import { t } from "../i18n"
import { buildModelsToml, type ModelsSelection } from "./catalog"

/** models.toml's [providers.*], with secrets.toml's [providers.<name>].api_key folded back in. */
export type ResolvedModelsFile = Omit<KajaModelsFile, "providers"> & {
  providers: Record<string, KajaModelsFile["providers"][string] & { api_key?: string }>
}

export function getModelsPath() {
  return join(getConfigDir(), "models.toml")
}

/** Writes models.toml for the providers the user ticked, replacing what was there. See {@link buildModelsToml}. */
export async function writeModelsFromCatalog(selection: ModelsSelection) {
  await write(file(getModelsPath()), buildModelsToml(selection))
}

/**
 * Points `[providers.<name>]`'s base_url at `baseUrl` in models.toml text, for the setup wizard's
 * "where does your server listen?" step. Edits the one line rather than re-serializing the parsed
 * file, which would drop the template's comments; unchanged when that table has no base_url.
 */
export function setProviderBaseUrl(text: string, provider: string, baseUrl: string): string {
  const lines = text.split("\n")
  const start = lines.findIndex(line => line.trim() === `[providers.${provider}]`)
  if (start === -1) return text

  for (let index = start + 1; index < lines.length; index++) {
    // Stop at the next table header so a provider without a base_url never rewrites another's.
    if (lines[index]!.trimStart().startsWith("[")) break
    const match = /^(\s*base_url\s*=\s*)"[^"]*"(.*)$/.exec(lines[index]!)
    if (match) {
      // JSON.stringify escapes anything that would break out of the TOML string.
      lines[index] = `${match[1]}${JSON.stringify(baseUrl)}${match[2]}`
      return lines.join("\n")
    }
  }
  return text
}

/**
 * Points `[tasks]`'s `task` at another model id in models.toml text, for the doctor switching a broken
 * model to another that serves the same task. Edits (or adds) that one line, so every model entry and the
 * template's comments stay as they are.
 */
export function setTaskModel(text: string, task: string, id: string): string {
  const lines = text.split("\n")
  const line = `${task} = ${JSON.stringify(id)}`
  const start = lines.findIndex(l => l.trim() === "[tasks]")
  if (start === -1) return text
  let end = lines.length
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index]!.trimStart().startsWith("[")) {
      end = index
      break
    }
    const match = new RegExp(String.raw`^(\s*)"?${task}"?(\s*=\s*)"[^"]*"(.*)$`).exec(lines[index]!)
    if (match) {
      lines[index] = `${match[1]}${task}${match[2]}${JSON.stringify(id)}${match[3]}`
      return lines.join("\n")
    }
  }
  // Not there yet: add it after the table's last line.
  let at = end
  while (at > start + 1 && lines[at - 1]!.trim() === "") at--
  lines.splice(at, 0, line)
  return lines.join("\n")
}

/** Reads models.toml, points a task at another model id, and writes it back. No-op when the file is missing. */
export async function saveTaskModel(task: string, id: string) {
  const f = file(getModelsPath())
  if (!(await f.exists())) return
  const text = await f.text()
  const next = setTaskModel(text, task, id)
  if (next !== text) await write(f, next)
}

/** The `kaja config fetch` subcommand: (re-)writes the bundled docs/config/models.default.toml template, backing up any existing (differing) file first. */
export async function fetchModelsToml(): Promise<{ path: string; backedUpTo?: string; unchanged?: boolean }> {
  return writeTemplateConfig(TEMPLATE, getModelsPath())
}

/** Flattens each models.toml entry with its provider's credentials, once per task it lists. */
export function resolveModels(data: ResolvedModelsFile): CliResolvedModel[] {
  return Object.entries(data.models).flatMap(([id, entry]) => {
    const provider = data.providers[entry.provider]!
    return entry.tasks.map(task => ({
      id,
      model: entry.model,
      task,
      baseUrl: provider.base_url,
      apiKey: provider.api_key,
      provider: entry.provider,
      ...(entry.context_window ? { contextWindow: entry.context_window } : {})
    }))
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

/** Resolves the model to use for a task: a persona's pin for that task wins, else the one [tasks] names. */
export function resolveActiveModel(
  data: ResolvedModelsFile,
  task: ModelTask,
  personaModels?: PersonaModels
): CliResolvedModel | undefined {
  const models = resolveModels(data)
  const pinned = findModelById(models, personaModels?.[task], task)
  if (pinned) return pinned
  return findModelById(models, data.tasks[task], task)
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

/**
 * Whether `models.toml` + `secrets.toml` resolves a usable chat model (the one [tasks] names).\
 * Providers without an `api_key` are allowed.
 */
export async function hasConfiguredChatModel(): Promise<boolean> {
  const modelsFile = await loadModelsFile()
  const chatEntry = resolveActiveModel(modelsFile, "chat")
  if (!chatEntry) return false
  const provider = modelsFile.providers[chatEntry.provider]
  return provider !== undefined && provider.api_key !== undefined
}
