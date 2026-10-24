import type { ModelTask } from "@kaja/schema/config"
import { uniqueModelSlug } from "@kaja/shared/text"
import { groupTomlTables } from "@kaja/shared/toml"

/** One model a provider serves, and every task it can do. */
export type CatalogModel = {
  model: string
  /** Its display name, when the catalog has one. */
  name?: string
  tasks: ModelTask[]
  /** Tokens it takes in, when the catalog knows; written as `context_window`. */
  contextWindow?: number
  /** False for a text-only chat model; written as `images = false`. */
  images?: boolean
  /** It can call tools, which a chat model needs to be any use to Kaja. */
  toolCall?: boolean
  /** Release date, `YYYY-MM-DD` or `YYYY-MM`: newer models are guessed first. */
  released?: string
  deprecated?: boolean
}

/** A provider the setup wizard knows how to configure. */
export type CatalogProvider = {
  /** The `[providers.<id>]` key, and the name its API key goes under in secrets.toml. */
  id: string
  /** How it is written on screen; a proper noun, so it is never translated. */
  name: string
  /** `hosted` (someone else's server) is asked for an API key, `self-hosted` (the user's own server) for its address. */
  kind: "hosted" | "self-hosted"
  baseUrl: string
  /** The environment variables its API key is usually found in, e.g. `OPENAI_API_KEY`. */
  env?: string[]
  /** A trailing comment on its `base_url` line. */
  note?: string
  /** What it can serve. */
  models: CatalogModel[]
  /**
   * Its models are a list the user made (their own provider, or one models.toml has that the catalog doesn't): every
   * one of them is written, not only the picked ones.
   */
  own?: boolean
}

/** The order tasks appear in models.toml. */
export const TASK_ORDER: ModelTask[] = [
  "chat",
  "embedding",
  "rerank",
  "image-generation",
  "tts",
  "stt",
  "summarize",
  "vision"
]

/**
 * The providers the wizard offers: models.dev's once `setCatalog` swaps them in, empty until then (offline, the wizard
 * asks for every detail instead). Swapped in place, so every importer keeps the one array.
 */
export const CATALOG: CatalogProvider[] = []

/** Makes `providers` the ones the wizard offers, or none when undefined. */
export function setCatalog(providers?: CatalogProvider[]): void {
  CATALOG.splice(0, CATALOG.length, ...(providers ?? []))
}

/** The catalog entry named `id`, if there is one. */
export function catalogProvider(id: string): CatalogProvider | undefined {
  return CATALOG.find(provider => provider.id === id)
}

/** A model picked for a task: which provider, and the id sent to it. */
export type ModelPick = { provider: string; model: string }

/** One way to serve a task: a provider's model. */
export type ModelCandidate = CatalogModel & { provider: string }

// The tasks Kaja runs tools in: a model that can't call them is a poor guess there.
const NEEDS_TOOLS = new Set<ModelTask>(["chat", "vision"])

// Best guess first: current before deprecated, tool-calling where tools are used, then newest.
function byGuess(task: ModelTask) {
  return (a: ModelCandidate, b: ModelCandidate) =>
    Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)) ||
    (NEEDS_TOOLS.has(task) ? Number(Boolean(b.toolCall)) - Number(Boolean(a.toolCall)) : 0) ||
    (b.released ?? "").localeCompare(a.released ?? "") ||
    a.model.localeCompare(b.model)
}

/** Who can serve each task, best guess first. */
export function candidatesByTask(providers: CatalogProvider[]): Partial<Record<ModelTask, ModelCandidate[]>> {
  const byTask: Partial<Record<ModelTask, ModelCandidate[]>> = {}
  for (const provider of providers) {
    for (const model of provider.models) {
      for (const task of model.tasks) byTask[task] = [...(byTask[task] ?? []), { ...model, provider: provider.id }]
    }
  }
  for (const [task, list] of Object.entries(byTask)) list.sort(byGuess(task as ModelTask))
  return byTask
}

const samePick = (a: ModelPick | undefined, b: ModelPick) => a?.provider === b.provider && a.model === b.model

/**
 * Each task's model: the one in `picks` while it's still a candidate, else the best guess. Vision guesses chat's pick
 * when that one can see, so one model does both.
 */
export function resolvePicks(
  providers: CatalogProvider[],
  tasks: ModelTask[],
  picks: Partial<Record<ModelTask, ModelPick>> = {}
): Partial<Record<ModelTask, ModelPick>> {
  const candidates = candidatesByTask(providers)
  const resolved: Partial<Record<ModelTask, ModelPick>> = {}
  for (const task of TASK_ORDER.filter(candidate => tasks.includes(candidate))) {
    const options = candidates[task]
    if (!options?.length) continue
    const wanted = picks[task] ?? (task === "vision" ? resolved.chat : undefined)
    const chosen = options.find(option => samePick(wanted, option)) ?? options[0]!
    resolved[task] = { provider: chosen.provider, model: chosen.model }
  }
  return resolved
}

/** What to write: the providers, each task's model, and any address the user changed. */
export type ModelsSelection = {
  providers: CatalogProvider[]
  /** Task to its model; a task not named here is off. */
  picks: Partial<Record<ModelTask, ModelPick>>
  /** Provider id to the address the user typed, replacing the catalog's default. */
  baseUrls?: Record<string, string>
}

const HEADER = `# Kaja models. Each [models.<id>] names the API it runs on (\`provider\`, a [providers.*] table) and
# what it can be used for (\`tasks\`); a task no model lists is off. Order matters: each task uses the
# first model in this file that lists it, so to switch, comment that one out or move another above it.
# The later ones are kept for a persona's [models] pin, or for \`kaja doctor\` to fall back to when one
# stops answering. \`model\` is the literal name sent to the API.
# Provider API keys live in secrets.toml's [providers.<name>] tables, keyed the same way.
`

type ModelEntry = {
  id: string
  provider: string
  model: string
  tasks: ModelTask[]
  contextWindow?: number
  images?: boolean
}

// A provider's [providers.<id>] table.
function providerTable(provider: CatalogProvider, baseUrl: string): string {
  const note = provider.note ? `  # ${provider.note}` : ""
  return [`[providers.${provider.id}]`, `base_url = ${JSON.stringify(baseUrl)}${note}`].join("\n")
}

/**
 * Builds models.toml text: each task's picked model is the first entry listing it, and a model serving several tasks
 * is one entry keyed by the slug of its name. An own provider's other models follow, listing only tasks that are on and
 * whose pick sits above them, for a persona pin or the doctor to reach. Text is generated rather than edited, so the
 * comments that explain the file are always there.
 */
export function buildModelsToml({ providers, picks, baseUrls = {} }: ModelsSelection): string {
  const providerTables = providers.map(provider => providerTable(provider, baseUrls[provider.id] ?? provider.baseUrl))
  const byId = new Map(providers.map(provider => [provider.id, provider]))

  const entries = new Map<string, ModelEntry>()
  const taken = new Set<string>()
  const entryFor = (provider: string, model: string) => {
    const key = `${provider}\n${model}`
    let entry = entries.get(key)
    if (!entry) {
      const id = uniqueModelSlug(taken, model, provider)
      taken.add(id)
      const known = byId.get(provider)?.models.find(candidate => candidate.model === model)
      entry = { id, provider, model, tasks: [], contextWindow: known?.contextWindow, images: known?.images }
      entries.set(key, entry)
    }
    return entry
  }

  // The picks first, so each is the first entry listing its task.
  for (const task of TASK_ORDER) {
    const pick = picks[task]
    if (pick && byId.has(pick.provider)) entryFor(pick.provider, pick.model).tasks.push(task)
  }
  const pickedAt = (task: ModelTask) => {
    const pick = picks[task]
    return pick ? [...entries.values()].indexOf(entryFor(pick.provider, pick.model)) : -1
  }
  for (const provider of providers.filter(candidate => candidate.own)) {
    for (const model of provider.models) {
      const entry = entryFor(provider.id, model.model)
      const at = [...entries.values()].indexOf(entry)
      for (const task of model.tasks) {
        // Never a task that's off, and never above that task's pick, where it would win
        if (entry.tasks.includes(task) || pickedAt(task) === -1 || at < pickedAt(task)) continue
        entry.tasks.push(task)
      }
    }
  }

  const modelTables = [...entries.values()]
    .filter(entry => entry.tasks.length > 0)
    .map(entry =>
      [
        `[models.${entry.id}]`,
        `model = ${JSON.stringify(entry.model)}`,
        `provider = "${entry.provider}"`,
        `tasks = [${entry.tasks.map(task => JSON.stringify(task)).join(", ")}]`,
        ...(entry.contextWindow ? [`context_window = ${entry.contextWindow}`] : []),
        ...(entry.images === false ? ["images = false"] : [])
      ].join("\n")
    )
  const out = [HEADER.trimEnd()]
  if (providerTables.length > 0) out.push(groupTomlTables("[providers]", providerTables))
  if (modelTables.length > 0) out.push(groupTomlTables("[models]", modelTables))
  return `${out.join("\n\n")}\n`
}
