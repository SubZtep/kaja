import type { ModelTask } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { writeTemplateConfig } from "../config/fetch"
import { buildModelsToml, candidatesByTask, CATALOG, type CatalogModel, type CatalogProvider } from "./catalog"
import { getModelsPath } from "./models"

// models.toml read loosely: a hand-edited file needn't match the schema to be re-offered
type LooseModelsFile = {
  providers?: Record<string, { base_url?: unknown }>
  models?: Record<
    string,
    { provider?: unknown; model?: unknown; tasks?: unknown; context_window?: unknown; images?: unknown }
  >
}

/** What models.toml already sets up, split into what the catalog knows and what it doesn't. */
export type CurrentModels = {
  /** The catalog providers it uses, in catalog order. */
  providers: string[]
  /** Where each self-hosted catalog provider listens. */
  addresses: Record<string, string>
  /** Providers the catalog doesn't know, with their models as written, in file order. */
  own: CatalogProvider[]
  /** The provider in use for each task more than one of these providers could serve. */
  picks: Partial<Record<ModelTask, string>>
}

// One own provider's models: each entry once per task it lists, keeping what it says about itself.
function ownModels(entries: NonNullable<LooseModelsFile["models"]>, provider: string): CatalogModel[] {
  return Object.values(entries)
    .filter(entry => entry.provider === provider && typeof entry.model === "string")
    .flatMap(entry =>
      (Array.isArray(entry.tasks) ? (entry.tasks as ModelTask[]) : []).map(task => ({
        task,
        model: entry.model as string,
        ...(typeof entry.context_window === "number" ? { contextWindow: entry.context_window } : {}),
        ...(entry.images === false ? { images: false } : {})
      }))
    )
}

/** Reads models.toml against the current catalog. Undefined when it is missing or unparseable. */
export async function readCurrentModels(): Promise<CurrentModels | undefined> {
  try {
    const f = file(getModelsPath())
    if (!(await f.exists())) return undefined
    const data = TOML.parse(await f.text()) as LooseModelsFile
    const tables = data.providers ?? {}
    const entries = data.models ?? {}

    const known = CATALOG.filter(provider => tables[provider.id])
    const addresses: Record<string, string> = {}
    for (const provider of known) {
      const url = tables[provider.id]?.base_url
      if (provider.kind === "self-hosted" && typeof url === "string") addresses[provider.id] = url
    }

    const own: CatalogProvider[] = Object.entries(tables)
      .filter(([id, table]) => !CATALOG.some(provider => provider.id === id) && typeof table?.base_url === "string")
      .map(([id, table]) => ({
        id,
        name: id,
        kind: "hosted",
        baseUrl: table.base_url as string,
        models: ownModels(entries, id)
      }))

    // The first model in the file that lists a task is the one in use.
    const picks: CurrentModels["picks"] = {}
    for (const [task, options] of Object.entries(candidatesByTask([...known, ...own]))) {
      const active = Object.values(entries).find(
        entry => Array.isArray(entry.tasks) && entry.tasks.includes(task)
      )?.provider
      if (options.length > 1 && typeof active === "string") picks[task as ModelTask] = active
    }
    return { providers: known.map(provider => provider.id), addresses, own, picks }
  } catch {
    return undefined
  }
}

/** Why `refreshModelsToml` wrote nothing. */
export type RefreshSkipped = { skipped: "no-catalog" | "no-models" | "no-catalog-providers" }

/**
 * The models.toml `kaja config fetch` would write: rebuilt from the catalog for the catalog providers the file already
 * uses, so their default models follow it. The user's own providers, self-hosted addresses and each contested task's
 * pick stay as they are. Needs the catalog loaded.
 */
export async function modelsTomlFromCatalog(): Promise<string | RefreshSkipped> {
  if (CATALOG.length === 0) return { skipped: "no-catalog" }
  const current = await readCurrentModels()
  if (!current) return { skipped: "no-models" }
  if (current.providers.length === 0) return { skipped: "no-catalog-providers" }

  const known = CATALOG.filter(provider => current.providers.includes(provider.id))
  return buildModelsToml({ providers: [...known, ...current.own], pick: current.picks, baseUrls: current.addresses })
}

/** Writes {@link modelsTomlFromCatalog}'s file, backing up a differing one first. */
export async function refreshModelsToml(): Promise<Awaited<ReturnType<typeof writeTemplateConfig>> | RefreshSkipped> {
  const text = await modelsTomlFromCatalog()
  return typeof text === "string" ? writeTemplateConfig(text, getModelsPath()) : text
}
