import { type CatalogFile, CatalogFileSchema, type ModelTask } from "@kaja/schema/config"
import { uniqueModelSlug } from "@kaja/shared"
import { TOML } from "bun"
import CATALOG_TOML from "../../../../docs/config/catalog.toml" with { type: "text" }

/** One model a provider serves, with the task it is used for. */
export type CatalogModel = { task: ModelTask; model: string }

/** A provider the setup wizard knows how to configure. */
export type CatalogProvider = {
  /** The `[providers.<id>]` key, and the name its API key goes under in secrets.toml. */
  id: string
  /** How it is written on screen; a proper noun, so it is never translated. */
  name: string
  /** `hosted` (someone else's server) is asked for an API key, `self-hosted` (the user's own server) for its address. */
  kind: "hosted" | "self-hosted"
  baseUrl: string
  /** Comment lines written above its `[providers.<id>]` table, without the leading `# `. */
  comment?: string[]
  /** A trailing comment on its `base_url` line. */
  note?: string
  /** What it can serve, in the order they are offered. */
  models: CatalogModel[]
}

/** The order tasks appear in models.toml. */
export const TASK_ORDER: ModelTask[] = ["chat", "embedding", "rerank", "image-generation", "tts", "stt", "summarize"]

const catalogFile = CatalogFileSchema.parse(TOML.parse(CATALOG_TOML))

/** The providers the wizard offers, from `docs/config/catalog.toml`, the one source of model defaults. */
export const CATALOG: CatalogProvider[] = catalogFile.providers.map(({ base_url, ...provider }) => ({
  ...provider,
  baseUrl: base_url
}))

/** The generated example files in `docs/config` (`bun generate:models`), each a mix of catalog providers. */
export const EXAMPLES = catalogFile.examples

/** An example's models.toml: its providers in catalog order, one model per task. */
export function exampleToml(example: CatalogFile["examples"][number]): string {
  const providers = CATALOG.filter(provider => example.providers.includes(provider.id))
  return buildModelsToml({ providers, pick: example.pick, alternatives: false })
}

/** The catalog entry named `id`, if there is one. */
export function catalogProvider(id: string): CatalogProvider | undefined {
  return CATALOG.find(provider => provider.id === id)
}

/** One way to serve a task: a provider and the model it names. */
export type ModelCandidate = { provider: string; model: string }

/** Who can serve each task, in provider order. A task with more than one is what the wizard asks about. */
export function candidatesByTask(providers: CatalogProvider[]): Partial<Record<ModelTask, ModelCandidate[]>> {
  const byTask: Partial<Record<ModelTask, ModelCandidate[]>> = {}
  for (const provider of providers) {
    for (const { task, model } of provider.models) {
      byTask[task] = [...(byTask[task] ?? []), { provider: provider.id, model }]
    }
  }
  return byTask
}

/** What to write: the providers, which of them serves each contested task, and any address the user changed. */
export type ModelsSelection = {
  providers: CatalogProvider[]
  /** Task to the provider id that serves it. A task not named here goes to its first candidate. */
  pick?: Partial<Record<ModelTask, string>>
  /** Provider id to the address the user typed, replacing the catalog's default. */
  baseUrls?: Record<string, string>
  /** Also write the candidates not picked, for pins and the doctor to switch to. Off for the examples, which show one model per task. */
  alternatives?: boolean
}

const HEADER = `# Kaja models. [tasks] says which model each task uses, by its [models.<id>] id; a task left out
# is off. Each [models.<id>] names the API it runs on (\`provider\`, a [providers.*] table) and what it
# can be used for (\`tasks\`); models no task uses are kept for a persona's [models] pin, or for
# \`kaja doctor\` to switch to when one stops answering. \`model\` is the literal name sent to the API.
# Provider API keys live in secrets.toml's [providers.<name>] tables, keyed the same way.
`

/**
 * Builds models.toml text for the chosen providers: [tasks] names each task's picked model, and every
 * model written is keyed by the slug of its name (a model serving several tasks is one entry). The other
 * candidates are written too, so a persona pin, or the doctor switching a broken model, can reach them.
 * Text is generated rather than edited, so the comments that explain the file are always there.
 */
export function buildModelsToml({ providers, pick = {}, baseUrls = {}, alternatives = true }: ModelsSelection): string {
  const out: string[] = [HEADER.trimEnd()]

  for (const provider of providers) {
    const lines = [...(provider.comment ?? []).map(line => `# ${line}`), `[providers.${provider.id}]`]
    const url = JSON.stringify(baseUrls[provider.id] ?? provider.baseUrl)
    const note = provider.note ? `  # ${provider.note}` : ""
    lines.push(`base_url = ${url}${note}`)
    out.push(lines.join("\n"))
  }

  // One entry per provider and model name, in task order, collecting every task it's written for.
  const entries = new Map<string, { id: string; provider: string; model: string; tasks: ModelTask[] }>()
  const taken = new Set<string>()
  const entryFor = (option: ModelCandidate) => {
    const key = `${option.provider}\n${option.model}`
    let entry = entries.get(key)
    if (!entry) {
      const id = uniqueModelSlug(taken, option.model, option.provider)
      taken.add(id)
      entry = { id, provider: option.provider, model: option.model, tasks: [] }
      entries.set(key, entry)
    }
    return entry
  }

  const candidates = candidatesByTask(providers)
  const inUse: string[] = []
  for (const task of TASK_ORDER) {
    const options = candidates[task]
    if (!options?.length) continue
    const chosen = options.find(option => option.provider === pick[task]) ?? options[0]!
    const written = alternatives ? [chosen, ...options.filter(o => o !== chosen)] : [chosen]
    for (const option of written) {
      const entry = entryFor(option)
      entry.tasks.push(task)
      if (option === chosen) inUse.push(`${task} = ${JSON.stringify(entry.id)}`)
    }
  }

  if (inUse.length > 0) out.push(["[tasks]", ...inUse].join("\n"))
  for (const entry of entries.values()) {
    out.push(
      [
        `[models.${entry.id}]`,
        `model = ${JSON.stringify(entry.model)}`,
        `provider = "${entry.provider}"`,
        `tasks = [${entry.tasks.map(task => JSON.stringify(task)).join(", ")}]`
      ].join("\n")
    )
  }
  return `${out.join("\n\n")}\n`
}
