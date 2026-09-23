import type { ModelTask } from "@kaja/schema/config"

/** One model a provider serves, with the task it is used for. */
export type CatalogModel = { task: ModelTask; model: string }

/** A provider the setup wizard knows how to configure. */
export type CatalogProvider = {
  /** The `[providers.<id>]` key, and the name its API key goes under in secrets.toml. */
  id: string
  /** How it is written on screen; a proper noun, so it is never translated. */
  name: string
  /** `hosted` is asked for an API key, `local` (a server on this machine) for its address. */
  kind: "hosted" | "local"
  baseUrl: string
  /** Comment lines written above its `[providers.<id>]` table. */
  comment?: string[]
  /** A trailing comment on its `base_url` line. */
  note?: string
  /** What it can serve, in the order they are offered. */
  models: CatalogModel[]
}

/** The order tasks appear in models.toml. */
export const TASK_ORDER: ModelTask[] = ["chat", "embedding", "rerank", "image-generation", "tts", "stt"]

/**
 * The providers the wizard offers. This is data, not a template: the file is generated from the ticked
 * ones, so any combination works. `docs/config/models.*.toml` stay as the documented examples, and a
 * test keeps the two from drifting apart.
 */
export const CATALOG: CatalogProvider[] = [
  {
    id: "fireworks",
    name: "Fireworks",
    kind: "hosted",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    models: [
      { task: "chat", model: "accounts/fireworks/models/minimax-m3" },
      { task: "embedding", model: "accounts/fireworks/models/qwen3-embedding-8b" },
      { task: "rerank", model: "accounts/fireworks/models/qwen3-reranker-8b" }
    ]
  },
  {
    id: "xai",
    name: "xAI",
    kind: "hosted",
    baseUrl: "https://api.x.ai/v1",
    models: [{ task: "image-generation", model: "grok-imagine-image" }]
  },
  {
    id: "ollama",
    name: "Ollama",
    kind: "local",
    baseUrl: "http://localhost:11434/v1",
    comment: [
      '# Ollama requires an API key but ignores its value, e.g. [providers.ollama] api_key = "ollama" in secrets.toml.'
    ],
    models: [
      { task: "chat", model: "llama3.2:1b" },
      { task: "embedding", model: "nomic-embed-text" }
    ]
  },
  {
    id: "llama",
    name: "llama.cpp",
    kind: "local",
    baseUrl: "http://localhost:8080/v1",
    comment: ["# llama.cpp's server doesn't need an API key."],
    models: [{ task: "chat", model: "mistralai/Ministral-3-3B-Reasoning-2512-GGUF:Q4_K_M" }]
  },
  {
    id: "speaches",
    name: "Speaches",
    kind: "local",
    baseUrl: "http://localhost:8000",
    note: "local server, no key needed",
    // Speaches serves both directions, so ticking it sets up voice in and out together.
    models: [
      { task: "tts", model: "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16" },
      { task: "stt", model: "Systran/faster-whisper-small" }
    ]
  }
]

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
}

const HEADER = `# Kaja models — [models.<task>] entries each pick a [providers.*] table with
# \`provider = "<name>"\`. The id equal to the task name (e.g. "chat") is the one used for that task;
# other models of the same task are kept as [models.<provider>-<task>], and a persona's
# [models].<task> can pin one of them by id. \`model\` is the literal name sent to the provider's API.
# Provider API keys live in secrets.toml's [providers.<name>] tables, keyed the same way.
`

/** A model id nobody has taken yet: `<provider>-<task>`, numbered when a provider serves a task twice. */
function freeId(taken: Set<string>, provider: string, task: ModelTask): string {
  const base = `${provider}-${task}`
  let id = base
  let n = 1
  while (taken.has(id)) {
    n++
    id = `${base}-${n}`
  }
  return id
}

/**
 * Builds models.toml text for the chosen providers. Each task's picked model becomes `[models.<task>]`,
 * the id the app looks up; the other candidates are written beside it so a persona pin, or the doctor
 * switching a broken model, can reach them. Text is generated rather than edited, so the comments
 * that explain the file are always there.
 */
export function buildModelsToml({ providers, pick = {}, baseUrls = {} }: ModelsSelection): string {
  const out: string[] = [HEADER.trimEnd()]

  for (const provider of providers) {
    const lines = [...(provider.comment ?? []), `[providers.${provider.id}]`]
    const url = JSON.stringify(baseUrls[provider.id] ?? provider.baseUrl)
    const note = provider.note ? `  # ${provider.note}` : ""
    lines.push(`base_url = ${url}${note}`)
    out.push(lines.join("\n"))
  }

  const candidates = candidatesByTask(providers)
  const taken = new Set<string>(TASK_ORDER)
  const entries: string[] = []
  for (const task of TASK_ORDER) {
    const options = candidates[task]
    if (!options?.length) continue
    const chosen = options.find(option => option.provider === pick[task]) ?? options[0]!
    for (const option of [chosen, ...options.filter(o => o !== chosen)]) {
      const id = option === chosen ? task : freeId(taken, option.provider, task)
      taken.add(id)
      entries.push(
        `[models.${id}]\nmodel = ${JSON.stringify(option.model)}\ntask = "${task}"\nprovider = "${option.provider}"`
      )
    }
  }
  out.push(...entries)

  // The one task no provider here can serve stays as an example, like the bundled templates.
  if (!candidates.stt) {
    out.push('# [models.stt]\n# model = "<provider-specific model name>"\n# task = "stt"\n# provider = "<name>"')
  }
  return `${out.join("\n\n")}\n`
}
