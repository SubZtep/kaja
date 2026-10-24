import type { ModelTask } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { writeTemplateConfig } from "../config/fetch"
import { buildModelsToml, CATALOG, type CatalogModel, type CatalogProvider, type ModelPick } from "./catalog"
import { sameAddress } from "./detect"
import { getModelsPath } from "./models"

// models.toml read loosely: a hand-edited file needn't match the schema to be re-offered
type LooseEntry = { provider?: unknown; model?: unknown; tasks?: unknown; context_window?: unknown; images?: unknown }
type LooseModelsFile = { providers?: Record<string, { base_url?: unknown }>; models?: Record<string, LooseEntry> }

/** What models.toml already sets up, split into what the catalog knows and what it doesn't. */
export type CurrentModels = {
  /** The catalog providers it uses, in catalog order. */
  providers: string[]
  /** Where each self-hosted catalog provider listens. */
  addresses: Record<string, string>
  /** Providers the catalog doesn't know, with their models as written, in file order. */
  own: CatalogProvider[]
  /** The model in use for each task: the first entry listing it. */
  picks: Partial<Record<ModelTask, ModelPick>>
}

const tasksOf = (entry: LooseEntry) => (Array.isArray(entry.tasks) ? (entry.tasks as ModelTask[]) : [])

/** One provider's models as written, one per model id, each with its listed tasks; `known` fills in what it knows. */
function fileModels(entries: LooseEntry[], provider: string, known?: CatalogProvider): CatalogModel[] {
  const models = new Map<string, CatalogModel>()
  for (const entry of entries) {
    if (entry.provider !== provider || typeof entry.model !== "string") continue
    const existing = models.get(entry.model)
    if (existing) {
      existing.tasks = [...new Set([...existing.tasks, ...tasksOf(entry)])]
      continue
    }
    const catalog = known?.models.find(model => model.model === entry.model)
    const contextWindow = catalog ? catalog.contextWindow : entry.context_window
    const images = catalog ? catalog.images : entry.images
    models.set(entry.model, {
      model: entry.model,
      tasks: tasksOf(entry),
      ...(typeof contextWindow === "number" ? { contextWindow } : {}),
      ...(images === false ? { images: false } : {})
    })
  }
  return [...models.values()]
}

async function readModelsFile(): Promise<LooseModelsFile | undefined> {
  try {
    const f = file(getModelsPath())
    if (!(await f.exists())) return undefined
    return TOML.parse(await f.text()) as LooseModelsFile
  } catch {
    return undefined
  }
}

/**
 * A provider models.toml names differently from the catalog but at the same address (an older `fireworks` for
 * models.dev's `fireworks-ai`) is that catalog provider: the catalog entry takes the file's id, so its key in
 * secrets.toml and its models keep matching.
 */
function adoptFileIds(tables: NonNullable<LooseModelsFile["providers"]>): void {
  for (const [id, table] of Object.entries(tables)) {
    if (catalogHas(id) || typeof table?.base_url !== "string") continue
    const url = table.base_url
    // Hosted only: many local servers share a port, so a local address says nothing about which one it is
    const match = CATALOG.find(
      provider => provider.kind === "hosted" && !tables[provider.id] && sameAddress(provider.baseUrl, url)
    )
    if (match) match.id = id
  }
}

/** Reads models.toml against the current catalog. Undefined when it is missing or unparseable. */
export async function readCurrentModels(): Promise<CurrentModels | undefined> {
  const data = await readModelsFile()
  if (!data) return undefined
  const tables = data.providers ?? {}
  adoptFileIds(tables)
  const entries = Object.values(data.models ?? {})

  const known = CATALOG.filter(provider => tables[provider.id])
  const addresses: Record<string, string> = {}
  for (const provider of known) {
    const url = tables[provider.id]?.base_url
    if (provider.kind === "self-hosted" && typeof url === "string") addresses[provider.id] = url
  }

  const own: CatalogProvider[] = Object.entries(tables)
    .filter(([id, table]) => !catalogHas(id) && typeof table?.base_url === "string")
    .map(([id, table]) => ({
      id,
      name: id,
      kind: "hosted",
      baseUrl: table.base_url as string,
      models: fileModels(entries, id),
      own: true
    }))

  return { providers: known.map(provider => provider.id), addresses, own, picks: picksOf(entries) }
}

const catalogHas = (id: string) => CATALOG.some(provider => provider.id === id)

// The first model in the file that lists a task is the one in use.
function picksOf(entries: LooseEntry[]): Partial<Record<ModelTask, ModelPick>> {
  const picks: Partial<Record<ModelTask, ModelPick>> = {}
  for (const entry of entries) {
    if (typeof entry.provider !== "string" || typeof entry.model !== "string") continue
    for (const task of tasksOf(entry)) picks[task] ??= { provider: entry.provider, model: entry.model }
  }
  return picks
}

/** Why `refreshModelsToml` wrote nothing. */
export type RefreshSkipped = { skipped: "no-catalog" | "no-models" | "no-catalog-providers" }

/**
 * The models.toml `kaja config fetch` would write: the same providers, models and picks, with what the catalog now says
 * about them (a hosted provider's address, each model's context window and image support). Needs the catalog loaded.
 */
export async function modelsTomlFromCatalog(): Promise<string | RefreshSkipped> {
  if (CATALOG.length === 0) return { skipped: "no-catalog" }
  const data = await readModelsFile()
  if (!data) return { skipped: "no-models" }
  const tables = data.providers ?? {}
  adoptFileIds(tables)
  if (!Object.keys(tables).some(catalogHas)) return { skipped: "no-catalog-providers" }

  const entries = Object.values(data.models ?? {})
  const baseUrls: Record<string, string> = {}
  const providers: CatalogProvider[] = []
  for (const [id, table] of Object.entries(tables)) {
    if (typeof table?.base_url !== "string") continue
    const known = CATALOG.find(provider => provider.id === id)
    // A self-hosted address is the user's; a hosted one follows the catalog
    if (!known || known.kind === "self-hosted") baseUrls[id] = table.base_url
    providers.push({
      ...(known ?? { id, name: id, kind: "hosted", baseUrl: table.base_url }),
      models: fileModels(entries, id, known),
      own: true
    })
  }
  return buildModelsToml({ providers, picks: picksOf(entries), baseUrls })
}

/** Writes {@link modelsTomlFromCatalog}'s file, backing up a differing one first. */
export async function refreshModelsToml(): Promise<Awaited<ReturnType<typeof writeTemplateConfig>> | RefreshSkipped> {
  const text = await modelsTomlFromCatalog()
  return typeof text === "string" ? writeTemplateConfig(text, getModelsPath()) : text
}
