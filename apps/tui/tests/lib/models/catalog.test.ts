import { expect, test } from "bun:test"
import { CatalogFileSchema, ModelsFileSchema } from "@kaja/schema/config"
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

// The examples are generated from the catalog (`bun generate:models`); a hand edit or a stale file fails here.
test.each(EXAMPLES)("docs/config/$file is what the catalog writes for it", async example => {
  const text = await Bun.file(`${import.meta.dir}/../../../../../docs/config/${example.file}`).text()
  expect(exampleToml(example)).toBe(text)
  parse(text)
})

test("an example's defaults follow catalog order, not the order it lists its providers in, unless it picks", () => {
  const forward = parse(exampleToml({ file: "models.x.toml", providers: ["llama", "xai"] }))
  const backward = parse(exampleToml({ file: "models.x.toml", providers: ["xai", "llama"] }))
  expect(backward).toEqual(forward)
  expect(forward.models.chat?.provider).toBe("llama")

  const picked = parse(exampleToml({ file: "models.x.toml", providers: ["llama", "xai"], pick: { chat: "xai" } }))
  expect(picked.models.chat?.provider).toBe("xai")
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
      // Every task somebody can serve has the entry the app looks up, and it is a real candidate.
      expect(parsed.models[task] !== undefined).toBe(options.length > 0)
      if (options.length === 0) continue
      const entries = Object.values(parsed.models).filter(entry => entry.task === task)
      expect(entries).toHaveLength(options.length)
      expect(options.some(o => o.provider === parsed.models[task]!.provider)).toBe(true)
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
  expect(picked.models.chat).toMatchObject({ provider: "ollama", model: "qwen3.5:4b" })
  expect(picked.models["fireworks-chat"]).toMatchObject({ provider: "fireworks", task: "chat" })

  // No answer means the first candidate, so a silent choice is still a sensible one.
  const unpicked = parse(buildModelsToml({ providers }))
  expect(unpicked.models.chat?.provider).toBe("fireworks")
  expect(unpicked.models["ollama-chat"]?.provider).toBe("ollama")
  // The examples leave the alternatives out: one model per task.
  const bare = parse(buildModelsToml({ providers, alternatives: false }))
  expect(bare.models["ollama-chat"]).toBeUndefined()
  expect(bare.models.chat?.provider).toBe("fireworks")
  // A task only one of them serves has no alternative.
  expect(Object.keys(unpicked.models).filter(id => id.endsWith("-rerank"))).toEqual([])
})

test("a provider serving a task twice gets numbered ids, never a duplicate table", () => {
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
  expect(Object.keys(parsed.models).sort()).toEqual(["chat", "custom-chat"])
  expect(parsed.models.chat?.model).toBe("big")
  expect(parsed.models["custom-chat"]?.model).toBe("small")
})

test("the comments that explain the file are written, and no placeholder for a task nobody serves", () => {
  const text = buildModelsToml({ providers: pick("ollama") })
  expect(text).toContain("# Kaja models")
  expect(text).toContain("# Ollama requires an API key but ignores its value")
  expect(text).not.toContain("# [models.")

  const withSpeech = buildModelsToml({ providers: pick("speaches") })
  expect(withSpeech).toContain("# local server, no key needed")
  expect(parse(withSpeech).models.stt?.provider).toBe("speaches")
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
  expect(CATALOG.filter(p => p.kind === "hosted").map(p => p.id)).toEqual(["fireworks", "xai"])
  expect(CATALOG.filter(p => p.kind === "self-hosted").map(p => p.id)).toEqual(["ollama", "llama", "speaches"])
})
