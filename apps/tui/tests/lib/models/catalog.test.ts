import { expect, test } from "bun:test"
import { PUBLIC_CATALOG_VERSION } from "@kaja/schema/api"
import { ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { TOML } from "bun"
import {
  buildModelsToml,
  candidatesByTask,
  CATALOG,
  type CatalogProvider,
  catalogProvider,
  setCatalog,
  TASK_ORDER
} from "../../../lib/models/catalog"
import { TEST_CATALOG } from "../../fixtures/catalog"

setCatalog(TEST_CATALOG)

const pick = (...ids: string[]): CatalogProvider[] => ids.map(id => catalogProvider(id)!)
const parse = (text: string) => ModelsFileSchema.parse(TOML.parse(text))
type Parsed = ReturnType<typeof parse>
/** The id of the entry used for `task`: the first that lists it. */
const inUseId = (parsed: Parsed, task: ModelTask) =>
  Object.entries(parsed.models).find(([, entry]) => entry.tasks.includes(task))?.[0]
/** The entry used for `task`. */
const inUse = (parsed: Parsed, task: ModelTask) => {
  const id = inUseId(parsed, task)
  return id ? parsed.models[id] : undefined
}

test("each provider offers its default model per task, and nothing it isn't the default for", () => {
  setCatalog({
    version: PUBLIC_CATALOG_VERSION,
    providers: [
      {
        id: "acme",
        name: "Acme",
        kind: "hosted",
        base_url: "https://acme.test/v1",
        note: "two\nlines",
        doc: null,
        models: [
          {
            model: "big",
            name: null,
            tasks: ["chat", "summarize"],
            default_tasks: ["chat"],
            context_window: 128000,
            images: false
          },
          {
            model: "small",
            name: null,
            tasks: ["chat", "summarize"],
            default_tasks: ["summarize"],
            context_window: null,
            images: true
          },
          { model: "spare", name: null, tasks: ["chat"], default_tasks: [], context_window: null, images: true }
        ]
      }
    ]
  })
  try {
    expect(CATALOG[0]).toEqual({
      id: "acme",
      name: "Acme",
      kind: "hosted",
      baseUrl: "https://acme.test/v1",
      note: "two lines",
      models: [
        { task: "chat", model: "big", contextWindow: 128000, images: false },
        { task: "summarize", model: "small" }
      ]
    })
    // What the catalog knows about a model goes into models.toml with it
    const parsed = parse(buildModelsToml({ providers: [...CATALOG] }))
    expect(parsed.models.big).toEqual({
      model: "big",
      provider: "acme",
      tasks: ["chat"],
      context_window: 128000,
      images: false
    })
  } finally {
    setCatalog(TEST_CATALOG)
  }
})

test("a provider with no default model yet isn't offered: it would serve nothing", () => {
  setCatalog({
    ...TEST_CATALOG,
    providers: [{ ...TEST_CATALOG.providers[0]!, id: "bare", models: [] }, TEST_CATALOG.providers[1]!]
  })
  expect(CATALOG.map(provider => provider.id)).toEqual(["ollama"])
  setCatalog(TEST_CATALOG)
})

test("no catalog means no providers to offer", () => {
  setCatalog(undefined)
  expect(CATALOG).toEqual([])
  setCatalog(TEST_CATALOG)
  expect(CATALOG).toHaveLength(6)
})

test("every combination of providers writes a file the schema accepts, with a default per task", () => {
  for (let mask = 1; mask < 1 << CATALOG.length; mask++) {
    const providers = CATALOG.filter((_, index) => mask & (1 << index))
    const parsed = parse(buildModelsToml({ providers }))
    const candidates = candidatesByTask(providers)

    for (const task of TASK_ORDER) {
      const options = candidates[task] ?? []
      // Every task somebody can serve has a model, picking a real candidate.
      expect(inUse(parsed, task) !== undefined).toBe(options.length > 0)
      if (options.length === 0) continue
      const entries = Object.values(parsed.models).filter(entry => entry.tasks.includes(task))
      expect(entries).toHaveLength(options.length)
      expect(options.some(o => o.provider === inUse(parsed, task)!.provider)).toBe(true)
    }
  }
})

test("with two providers for one task, the picked one is the default and the other is kept beside it", () => {
  const providers = pick("fireworks", "ollama")
  expect(candidatesByTask(providers).chat).toEqual([
    { provider: "fireworks", model: "accounts/fireworks/models/minimax-m3" },
    { provider: "ollama", model: "qwen3.5:4b" }
  ])

  const picked = parse(buildModelsToml({ providers, pick: { chat: "ollama" } }))
  expect(inUseId(picked, "chat")).toBe("qwen3-5-4b")
  expect(inUse(picked, "chat")).toMatchObject({ provider: "ollama", model: "qwen3.5:4b" })
  expect(picked.models["minimax-m3"]).toMatchObject({ provider: "fireworks", tasks: ["chat", "vision"] })
  // Vision follows the chat pick, so the chat model that sees images is the one in use for vision too
  expect(inUse(picked, "vision")).toMatchObject({ provider: "ollama", model: "qwen3.5:4b" })

  // No answer means the first candidate, so a silent choice is still a sensible one.
  const unpicked = parse(buildModelsToml({ providers }))
  expect(inUseId(unpicked, "chat")).toBe("minimax-m3")
  expect(unpicked.models["qwen3-5-4b"]?.provider).toBe("ollama")
  // Without alternatives: one model per task.
  const bare = parse(buildModelsToml({ providers, alternatives: false }))
  expect(bare.models["qwen3-5-4b"]).toBeUndefined()
  expect(inUse(bare, "chat")?.provider).toBe("fireworks")
  // A task only one of them serves has no alternative.
  expect(Object.values(unpicked.models).filter(entry => entry.tasks.includes("rerank"))).toHaveLength(1)
})

test("a picked model listed as another task's alternative never comes before that task's pick", () => {
  const provider = (id: string, models: CatalogProvider["models"]): CatalogProvider => ({
    id,
    name: id,
    kind: "hosted",
    baseUrl: `https://${id}.test/v1`,
    models
  })
  const cloud = provider("cloud", [
    { task: "chat", model: "c" },
    { task: "summarize", model: "s" }
  ])
  const local = provider("local", [
    { task: "chat", model: "q" },
    { task: "summarize", model: "q" }
  ])
  // q is picked for chat, so its entry comes first; listing summarize too would take it from s.
  const parsed = parse(buildModelsToml({ providers: [cloud, local], pick: { chat: "local", summarize: "cloud" } }))
  expect(inUseId(parsed, "chat")).toBe("q")
  expect(inUseId(parsed, "summarize")).toBe("s")
  expect(parsed.models.q?.tasks).toEqual(["chat"])
  expect(parsed.models.c?.tasks).toEqual(["chat"])
})

test("ids are slugs of the model name, with the provider added when two providers share a name", () => {
  const twin = (id: string): CatalogProvider => ({
    id,
    name: id,
    kind: "hosted",
    baseUrl: `https://${id}.test/v1`,
    models: [{ task: "chat", model: "org/Big-Model:7b" }]
  })
  const parsed = parse(buildModelsToml({ providers: [twin("one"), twin("two")] }))
  expect(Object.keys(parsed.models)).toEqual(["big-model-7b", "big-model-7b-two"])
  expect(inUseId(parsed, "chat")).toBe("big-model-7b")
})

test("a model serving two tasks is one entry listing both", () => {
  const both: CatalogProvider = {
    id: "local",
    name: "Local",
    kind: "self-hosted",
    baseUrl: "http://localhost/v1",
    models: [
      { task: "chat", model: "qwen3.5:4b" },
      { task: "summarize", model: "qwen3.5:4b" }
    ]
  }
  const parsed = parse(buildModelsToml({ providers: [both] }))
  expect(parsed.models).toEqual({
    "qwen3-5-4b": { model: "qwen3.5:4b", provider: "local", tasks: ["chat", "summarize"] }
  })
  expect(inUseId(parsed, "summarize")).toBe("qwen3-5-4b")
})

test("a provider serving a task twice gets two entries, never a duplicate table", () => {
  const twice: CatalogProvider = {
    id: "custom",
    name: "Custom",
    kind: "hosted",
    baseUrl: "https://example.test/v1",
    models: [
      { task: "chat", model: "big" },
      { task: "chat", model: "small" }
    ]
  }
  const parsed = parse(buildModelsToml({ providers: [twice] }))
  expect(Object.keys(parsed.models).sort()).toEqual(["big", "small"])
  expect(inUseId(parsed, "chat")).toBe("big")
})

test("the comments that explain the file are written, and no placeholder for a task nobody serves", () => {
  const text = buildModelsToml({ providers: pick("ollama") })
  expect(text).toContain("# Kaja models")
  expect(text).toContain("# needs an api_key in secrets.toml, any value")
  expect(text).not.toContain("# [models.")

  const withSpeech = buildModelsToml({ providers: pick("speaches") })
  expect(withSpeech).toContain("# local server, no key needed")
  expect(inUse(parse(withSpeech), "stt")?.provider).toBe("speaches")
})

test("an address the user typed replaces the default, and is escaped", () => {
  const parsed = parse(
    buildModelsToml({ providers: pick("ollama", "llama"), baseUrls: { ollama: "http://box.local:9090/v1" } })
  )
  expect(parsed.providers.ollama?.base_url).toBe("http://box.local:9090/v1")
  expect(parsed.providers.llama?.base_url).toBe("http://localhost:8080/v1")

  const text = buildModelsToml({ providers: pick("ollama"), baseUrls: { ollama: 'http://x/"evil' } })
  expect(text).toContain('base_url = "http://x/\\"evil"')
})

test("hosted providers are the ones asked for a key, self-hosted ones for an address", () => {
  expect(CATALOG.filter(p => p.kind === "hosted").map(p => p.id)).toEqual(["fireworks", "xai", "openrouter"])
  expect(CATALOG.filter(p => p.kind === "self-hosted").map(p => p.id)).toEqual(["ollama", "llama", "speaches"])
})
