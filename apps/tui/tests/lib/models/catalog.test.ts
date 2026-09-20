import { expect, test } from "bun:test"
import { ModelsFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import FIREWORKS_EXAMPLE from "../../../../../docs/config/models.fireworks.toml" with { type: "text" }
import LLAMA_EXAMPLE from "../../../../../docs/config/models.llama.toml" with { type: "text" }
import OLLAMA_EXAMPLE from "../../../../../docs/config/models.ollama.toml" with { type: "text" }
import {
  buildModelsToml,
  CATALOG,
  type CatalogProvider,
  candidatesByTask,
  catalogProvider,
  TASK_ORDER
} from "../../../lib/models/catalog"

const pick = (...ids: string[]): CatalogProvider[] => ids.map(id => catalogProvider(id)!)
const parse = (text: string) => ModelsFileSchema.parse(TOML.parse(text))

// The wizard writes from the catalog and the docs show the examples, so they have to say the same thing.
test.each([
  ["fireworks", FIREWORKS_EXAMPLE, ["fireworks", "xai", "speaches"]],
  ["ollama", OLLAMA_EXAMPLE, ["ollama"]],
  ["llama", LLAMA_EXAMPLE, ["llama", "xai"]]
])("the %s example in docs/config is what the catalog writes for it", (_name, example, ids) => {
  const written = parse(buildModelsToml({ providers: pick(...ids!) }))
  const documented = parse(example as string)
  expect(written.providers).toEqual(documented.providers)
  // Speaches also serves speech-to-text, which the fireworks example only shows commented out.
  const { stt: _stt, ...models } = written.models
  expect(models).toEqual(documented.models)
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
    { provider: "ollama", model: "llama3.2:1b" }
  ])

  const picked = parse(buildModelsToml({ providers, pick: { chat: "ollama" } }))
  expect(picked.models.chat).toMatchObject({ provider: "ollama", model: "llama3.2:1b" })
  expect(picked.models["fireworks-chat"]).toMatchObject({ provider: "fireworks", task: "chat" })

  // No answer means the first candidate, so a silent choice is still a sensible one.
  const unpicked = parse(buildModelsToml({ providers }))
  expect(unpicked.models.chat?.provider).toBe("fireworks")
  expect(unpicked.models["ollama-chat"]?.provider).toBe("ollama")
  // A task only one of them serves has no alternative.
  expect(Object.keys(unpicked.models).filter(id => id.endsWith("-rerank"))).toEqual([])
})

test("a provider serving a task twice gets numbered ids, never a duplicate table", () => {
  const twice: CatalogProvider = {
    id: "custom",
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

test("the comments that explain the file are written, and stt stays an example only when nobody serves it", () => {
  const text = buildModelsToml({ providers: pick("ollama") })
  expect(text).toContain("# Kaja models")
  expect(text).toContain("# Ollama requires an API key but ignores its value")
  expect(text).toContain("# [models.stt]")

  const withSpeech = buildModelsToml({ providers: pick("speaches") })
  expect(withSpeech).toContain("# local server, no key needed")
  expect(withSpeech).not.toContain("# [models.stt]")
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

test("hosted providers are the ones asked for a key, local ones for an address", () => {
  expect(CATALOG.filter(p => p.kind === "hosted").map(p => p.id)).toEqual(["fireworks", "xai"])
  expect(CATALOG.filter(p => p.kind === "local").map(p => p.id)).toEqual(["ollama", "llama", "speaches"])
})
