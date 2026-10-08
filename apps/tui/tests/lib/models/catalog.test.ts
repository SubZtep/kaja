import { expect, test } from "bun:test"
import { CatalogFileSchema, ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { TOML } from "bun"
import {
  buildModelsToml,
  CATALOG,
  type CatalogProvider,
  candidatesByTask,
  catalogProvider,
  EXAMPLES,
  exampleToml,
  TASK_ORDER
} from "../../../lib/models/catalog"

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

// The examples are generated from the catalog (`bun generate:models`); a hand edit or a stale file fails here.
// Content, not bytes: the file is tombi-formatted, which `bun check:models` checks exactly.
test.each(EXAMPLES)("config/$file is what the catalog writes for it", async example => {
  const text = await Bun.file(`${import.meta.dir}/../../../../../config/${example.file}`).text()
  expect(TOML.parse(text)).toEqual(TOML.parse(exampleToml(example)))
  parse(text)
})

test("an example's defaults follow catalog order, not the order it lists its providers in, unless it picks", () => {
  const forward = parse(exampleToml({ file: "models.x.toml", providers: ["llama", "xai"] }))
  const backward = parse(exampleToml({ file: "models.x.toml", providers: ["xai", "llama"] }))
  expect(backward).toEqual(forward)
  expect(inUse(forward, "chat")?.provider).toBe("llama")

  const picked = parse(exampleToml({ file: "models.x.toml", providers: ["llama", "xai"], pick: { chat: "xai" } }))
  expect(inUse(picked, "chat")?.provider).toBe("xai")
})

test("the catalog file rejects a pick outside the example, an unknown provider, and a missing default file", () => {
  const provider = {
    id: "a",
    name: "A",
    kind: "hosted",
    base_url: "https://a.test",
    models: [{ task: "chat", model: "m" }]
  }
  const ok = { file: "models.default.toml", providers: ["a"] }
  expect(CatalogFileSchema.safeParse({ providers: [provider], examples: [ok] }).success).toBe(true)
  expect(CatalogFileSchema.safeParse({ providers: [provider], examples: [] }).success).toBe(false)
  expect(CatalogFileSchema.safeParse({ providers: [provider], examples: [{ ...ok, providers: ["b"] }] }).success).toBe(
    false
  )
  expect(
    CatalogFileSchema.safeParse({ providers: [provider], examples: [{ ...ok, pick: { chat: "b" } }] }).success
  ).toBe(false)
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
  expect(picked.models["minimax-m3"]).toMatchObject({ provider: "fireworks", tasks: ["chat"] })

  // No answer means the first candidate, so a silent choice is still a sensible one.
  const unpicked = parse(buildModelsToml({ providers }))
  expect(inUseId(unpicked, "chat")).toBe("minimax-m3")
  expect(unpicked.models["qwen3-5-4b"]?.provider).toBe("ollama")
  // The examples leave the alternatives out: one model per task.
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
  expect(text).toContain("# Ollama requires an API key but ignores its value")
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
