import { afterAll, afterEach, beforeEach, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { join } from "node:path"
import { CATALOG, catalogProvider, setCatalog } from "../../../src/lib/models/catalog"
import { providersFromModelsDev, refreshCatalog } from "../../../src/lib/models/modelsdev"
import { getPaths } from "../../../src/lib/paths"

// One models.dev provider with a chat model, shaped like api.json's entries.
const provider = (id: string, extra: Record<string, unknown> = { api: "https://api.example.com/v1/" }) => ({
  id,
  name: id.toUpperCase(),
  env: [`${id.toUpperCase()}_API_KEY`],
  npm: "@ai-sdk/openai-compatible",
  ...extra,
  models: {
    [`${id}-chat`]: {
      id: `${id}-chat`,
      name: "Chat",
      tool_call: true,
      release_date: "2026-01-01",
      modalities: { input: ["text", "image"], output: ["text"] },
      limit: { context: 128000, output: 8000 }
    }
  }
})
const registry = (...providers: ReturnType<typeof provider>[]) =>
  Object.fromEntries(providers.map(entry => [entry.id, entry]))
const ids = () => CATALOG.map(p => p.id)

// A stand-in models.dev: each test sets what it answers, and sees what was asked.
let answer: (req: Request) => Response | Promise<Response> = () => new Response(null, { status: 500 })
const server = Bun.serve({ port: 0, fetch: req => answer(req) })
const url = `http://localhost:${server.port}/api.json`

beforeEach(() => {
  for (const name of ["models-dev.json", "models-dev.etag"]) rmSync(join(getPaths().cache, name), { force: true })
})
afterEach(() => {
  setCatalog()
})
afterAll(() => {
  server.stop(true)
})

test("models.dev's providers become the wizard's, with their key's env var and models", async () => {
  answer = () => Response.json(registry(provider("fresh")))
  expect(await refreshCatalog({ url })).toBe(true)
  expect(catalogProvider("fresh")).toEqual({
    id: "fresh",
    name: "FRESH",
    kind: "hosted",
    baseUrl: "https://api.example.com/v1",
    env: ["FRESH_API_KEY"],
    models: [
      {
        model: "fresh-chat",
        name: "Chat",
        tasks: ["chat", "summarize", "vision"],
        contextWindow: 128000,
        toolCall: true,
        released: "2026-01-01"
      }
    ]
  })
})

test("model types map to tasks, and a text-only chat model is marked as taking no images", () => {
  const [acme] = providersFromModelsDev({
    acme: {
      id: "acme",
      name: "Acme",
      api: "https://acme.test/v1",
      models: {
        a: { id: "a", modalities: { input: ["text"], output: ["text"] } },
        b: { id: "b", type: "embedding" },
        c: { id: "c", type: "transcription" },
        d: { id: "d", type: "speech" },
        e: { id: "e", type: "image" },
        f: { id: "f", type: "reranking" },
        g: { id: "g", type: "video" },
        h: { id: "h", status: "deprecated" }
      }
    }
  })
  expect(acme!.models.map(model => [model.model, model.tasks])).toEqual([
    ["a", ["chat", "summarize"]],
    ["b", ["embedding"]],
    ["c", ["stt"]],
    ["d", ["tts"]],
    ["e", ["image-generation"]],
    ["f", ["rerank"]],
    ["h", ["chat", "summarize"]]
  ])
  expect(acme!.models[0]!.images).toBe(false)
  expect(acme!.models.at(-1)!.deprecated).toBe(true)
})

test("a well-known provider without an address gets its usual one; an unknown one is left out", () => {
  const providers = providersFromModelsDev(registry(provider("openai", {}), provider("mystery", {})))
  expect(providers.map(p => [p.id, p.baseUrl])).toEqual([["openai", "https://api.openai.com/v1"]])
})

test("a provider on localhost is self-hosted; a hosted one on plain http is left out", () => {
  const providers = providersFromModelsDev(
    registry(
      provider("lmstudio", { api: "http://127.0.0.1:1234/v1" }),
      provider("leaky", { api: "http://api.example.com/v1" }),
      provider("cloud")
    )
  )
  expect(providers.map(p => [p.id, p.kind])).toEqual([
    ["cloud", "hosted"],
    ["lmstudio", "self-hosted"]
  ])
})

test("a provider with no model Kaja can use is left out", () => {
  const providers = providersFromModelsDev({
    ...registry(provider("ok")),
    video: { id: "video", name: "Video", api: "https://v.test/v1", models: { v: { id: "v", type: "video" } } }
  })
  expect(providers.map(p => p.id)).toEqual(["ok"])
})

test.each([
  ["an error status", () => new Response("nope", { status: 503 })],
  ["a body that isn't JSON", () => new Response("<html>")],
  ["a registry with no usable provider", () => Response.json({})]
])("%s leaves no catalog when none was cached", async (_name, respond) => {
  setCatalog(providersFromModelsDev(registry(provider("stale"))))
  answer = respond
  expect(await refreshCatalog({ url })).toBe(false)
  expect(ids()).toEqual([])
})

test("a server that never answers is given up on", async () => {
  answer = () => new Promise<Response>(() => {})
  expect(await refreshCatalog({ url, timeoutMs: 50 })).toBe(false)
})

test("the last good registry is cached: a 304 and an unreachable server both use it", async () => {
  answer = () => Response.json(registry(provider("kept")), { headers: { ETag: '"v1"' } })
  expect(await refreshCatalog({ url })).toBe(true)

  let sent: string | null | undefined
  answer = req => {
    sent = req.headers.get("if-none-match")
    return new Response(null, { status: 304 })
  }
  setCatalog()
  expect(await refreshCatalog({ url })).toBe(true)
  expect(sent).toBe('"v1"')
  expect(ids()).toEqual(["kept"])

  setCatalog()
  expect(await refreshCatalog({ url: "http://localhost:1/api.json" })).toBe(true)
  expect(ids()).toEqual(["kept"])
})
