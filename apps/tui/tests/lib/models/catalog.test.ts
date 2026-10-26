import { expect, test } from "bun:test"
import { ModelsFileSchema, type ModelTask } from "@kaja/schema/config"
import { TOML } from "bun"
import {
  buildModelsToml,
  candidatesByTask,
  CATALOG,
  type CatalogProvider,
  catalogProvider,
  resolvePicks,
  setCatalog,
  TASK_ORDER
} from "../../../src/lib/models/catalog"
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
const provider = (id: string, models: CatalogProvider["models"], own?: boolean): CatalogProvider => ({
  id,
  name: id,
  kind: "hosted",
  baseUrl: `https://${id}.test/v1`,
  models,
  ...(own ? { own } : {})
})

test("no catalog means no providers to offer", () => {
  setCatalog(undefined)
  expect(CATALOG).toEqual([])
  setCatalog(TEST_CATALOG)
  expect(CATALOG).toHaveLength(6)
})

test("candidates come best guess first: current, tool-calling for chat, then newest", () => {
  const acme = provider("acme", [
    { model: "old", tasks: ["chat", "summarize"], toolCall: true, released: "2025-01-01" },
    { model: "new-no-tools", tasks: ["chat", "summarize"], released: "2026-05-01" },
    { model: "new", tasks: ["chat", "summarize"], toolCall: true, released: "2026-04-01" },
    { model: "gone", tasks: ["chat", "summarize"], toolCall: true, released: "2026-09-01", deprecated: true }
  ])
  const candidates = candidatesByTask([acme])
  expect(candidates.chat?.map(c => c.model)).toEqual(["new", "old", "new-no-tools", "gone"])
  // Summarizing runs no tools, so newest wins there
  expect(candidates.summarize?.map(c => c.model)).toEqual(["new-no-tools", "new", "old", "gone"])
})

test("each task resolves to its pick while that's a candidate, else the best guess", () => {
  const providers = pick("fireworks", "ollama")
  const guessed = resolvePicks(providers, ["chat", "embedding", "vision"])
  expect(guessed.chat).toEqual({ provider: "fireworks", model: "accounts/fireworks/models/minimax-m3" })
  expect(guessed.embedding?.provider).toBe("fireworks")
  // A task that isn't wanted gets nothing
  expect(guessed.summarize).toBeUndefined()

  const picked = resolvePicks(providers, ["chat"], { chat: { provider: "ollama", model: "qwen3.5:4b" } })
  expect(picked.chat).toEqual({ provider: "ollama", model: "qwen3.5:4b" })
  // A pick no ticked provider serves any more falls back to the guess
  const stale = resolvePicks(providers, ["chat"], { chat: { provider: "xai", model: "grok-4.3" } })
  expect(stale.chat?.provider).toBe("fireworks")
})

test("vision guesses the chat pick when that model can see, so one model does both", () => {
  const providers = pick("fireworks", "ollama")
  const picks = resolvePicks(providers, ["chat", "vision"], { chat: { provider: "ollama", model: "qwen3.5:4b" } })
  expect(picks.vision).toEqual({ provider: "ollama", model: "qwen3.5:4b" })
})

test("every combination of providers writes a file the schema accepts, with each wanted task served", () => {
  for (let mask = 1; mask < 1 << CATALOG.length; mask++) {
    const providers = CATALOG.filter((_, index) => mask & (1 << index))
    const parsed = parse(buildModelsToml({ providers, picks: resolvePicks(providers, TASK_ORDER) }))
    const candidates = candidatesByTask(providers)
    for (const task of TASK_ORDER) expect(inUse(parsed, task) !== undefined).toBe(Boolean(candidates[task]?.length))
  }
})

test("only the picked models of a catalog provider are written, a model serving two tasks as one entry", () => {
  const providers = pick("fireworks")
  const parsed = parse(buildModelsToml({ providers, picks: resolvePicks(providers, ["chat", "summarize", "vision"]) }))
  expect(parsed.models).toEqual({
    "minimax-m3": {
      model: "accounts/fireworks/models/minimax-m3",
      provider: "fireworks",
      tasks: ["chat", "summarize", "vision"]
    }
  })
})

test("a task with no pick is off", () => {
  const providers = pick("fireworks")
  const parsed = parse(buildModelsToml({ providers, picks: resolvePicks(providers, ["chat"]) }))
  expect(inUse(parsed, "embedding")).toBeUndefined()
  expect(inUse(parsed, "summarize")).toBeUndefined()
})

test("an own provider's other models are kept after the picks, only for tasks that are on", () => {
  const box = provider(
    "box",
    [
      { model: "big", tasks: ["chat"] },
      { model: "small", tasks: ["chat", "summarize"] },
      { model: "voice", tasks: ["tts"] }
    ],
    true
  )
  const parsed = parse(buildModelsToml({ providers: [box], picks: { chat: { provider: "box", model: "big" } } }))
  expect(inUseId(parsed, "chat")).toBe("big")
  expect(parsed.models.small?.tasks).toEqual(["chat"])
  // tts and summarize have no pick, so they stay off
  expect(parsed.models.voice).toBeUndefined()
})

test("an own model picked for one task never lists another above that task's pick", () => {
  const local = provider("local", [{ model: "q", tasks: ["chat", "summarize"] }], true)
  const cloud = provider("cloud", [{ model: "s", tasks: ["summarize"] }])
  const parsed = parse(
    buildModelsToml({
      providers: [cloud, local],
      picks: { chat: { provider: "local", model: "q" }, summarize: { provider: "cloud", model: "s" } }
    })
  )
  expect(inUseId(parsed, "chat")).toBe("q")
  expect(inUseId(parsed, "summarize")).toBe("s")
  expect(parsed.models.q?.tasks).toEqual(["chat"])
})

test("ids are slugs of the model name, with the provider added when two providers share a name", () => {
  const twin = (id: string) => provider(id, [{ model: "org/Big-Model:7b", tasks: ["chat", "embedding"] }])
  const parsed = parse(
    buildModelsToml({
      providers: [twin("one"), twin("two")],
      picks: {
        chat: { provider: "one", model: "org/Big-Model:7b" },
        embedding: { provider: "two", model: "org/Big-Model:7b" }
      }
    })
  )
  expect(Object.keys(parsed.models)).toEqual(["big-model-7b", "big-model-7b-two"])
})

test("what the catalog knows about a model is written with it", () => {
  const acme = provider("acme", [{ model: "m", tasks: ["chat"], contextWindow: 128000, images: false }])
  const parsed = parse(buildModelsToml({ providers: [acme], picks: { chat: { provider: "acme", model: "m" } } }))
  expect(parsed.models.m).toMatchObject({ context_window: 128000, images: false })
})

test("the comments that explain the file are written, and no placeholder for a task nobody serves", () => {
  const providers = pick("ollama")
  const text = buildModelsToml({ providers, picks: resolvePicks(providers, ["chat"]) })
  expect(text).toContain("# Kaja models")
  expect(text).toContain("# needs an api_key in secrets.toml, any value")
  expect(text).not.toContain("# [models.")
})

test("an address the user typed replaces the default, and is escaped", () => {
  const providers = pick("ollama", "llama")
  const picks = resolvePicks(providers, ["chat"])
  const parsed = parse(buildModelsToml({ providers, picks, baseUrls: { ollama: "http://box.local:9090/v1" } }))
  expect(parsed.providers.ollama?.base_url).toBe("http://box.local:9090/v1")
  expect(parsed.providers.llama?.base_url).toBe("http://localhost:8080/v1")

  const text = buildModelsToml({ providers: pick("ollama"), picks, baseUrls: { ollama: 'http://x/"evil' } })
  expect(text).toContain('base_url = "http://x/\\"evil"')
})
