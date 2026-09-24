import { beforeEach, expect, test } from "bun:test"
import { clearContextWindowCache, DEFAULT_CONTEXT_WINDOW, resolveContextWindow } from "../../src/models/context-window"

beforeEach(() => clearContextWindowCache())

/** A fake server answering the given paths with JSON; everything else is a 404. Records what was asked. */
function server(routes: Record<string, unknown>) {
  const calls: string[] = []
  const fetchFn = async (input: string) => {
    const path = new URL(input).pathname
    calls.push(path)
    return path in routes ? Response.json(routes[path]) : new Response("not found", { status: 404 })
  }
  return { fetchFn, calls }
}

test("a configured window wins without asking the server", async () => {
  const { fetchFn, calls } = server({})
  const window = await resolveContextWindow({ baseUrl: "http://x/v1", model: "m", contextWindow: 8192 }, fetchFn)
  expect(window).toEqual({ tokens: 8192, source: "config" })
  expect(calls).toEqual([])
})

test("llama.cpp: /props n_ctx, the size it runs with", async () => {
  const { fetchFn } = server({ "/props": { default_generation_settings: { n_ctx: 16384 } } })
  expect(await resolveContextWindow({ baseUrl: "http://llama/v1", model: "m" }, fetchFn)).toEqual({
    tokens: 16384,
    source: "detected"
  })
})

test("Ollama: a loaded model's running size beats what the model supports", async () => {
  const { fetchFn } = server({
    "/api/ps": { models: [{ name: "qwen3.5:4b", context_length: 8192 }] },
    "/api/show": { model_info: { "qwen3.context_length": 262144 } }
  })
  expect((await resolveContextWindow({ baseUrl: "http://ollama/v1", model: "qwen3.5:4b" }, fetchFn)).tokens).toBe(8192)
})

test("Ollama: num_ctx the model sets, else the model's own maximum", async () => {
  const withParam = server({
    "/api/ps": { models: [] },
    "/api/show": { parameters: "temperature 0.7\nnum_ctx 12288", model_info: { "qwen3.context_length": 262144 } }
  })
  expect((await resolveContextWindow({ baseUrl: "http://a/v1", model: "q" }, withParam.fetchFn)).tokens).toBe(12288)

  const infoOnly = server({ "/api/show": { model_info: { "llama.context_length": 131072 } } })
  expect((await resolveContextWindow({ baseUrl: "http://b/v1", model: "q" }, infoOnly.fetchFn)).tokens).toBe(131072)
})

test("an OpenAI-compatible /models entry, under any of the names hosts use", async () => {
  for (const field of ["context_length", "context_window", "max_model_len", "max_context_length"]) {
    clearContextWindowCache()
    const { fetchFn } = server({ "/inference/v1/models": { data: [{ id: "other" }, { id: "m", [field]: 200000 }] } })
    const window = await resolveContextWindow({ baseUrl: "https://host/inference/v1", model: "m" }, fetchFn)
    expect(window).toEqual({ tokens: 200000, source: "detected" })
  }
})

test("Fireworks: its own model API, when the /models list fails", async () => {
  const { fetchFn, calls } = server({ "/v1/accounts/fireworks/models/minimax-m3": { contextLength: 512000 } })
  const window = await resolveContextWindow(
    { baseUrl: "https://api.fireworks.ai/inference/v1", model: "accounts/fireworks/models/minimax-m3", apiKey: "k" },
    fetchFn
  )
  expect(window).toEqual({ tokens: 512000, source: "detected" })
  expect(calls).toContain("/v1/accounts/fireworks/models/minimax-m3")
})

test("nothing reported: the fallback, and the server is asked only once per model", async () => {
  const { fetchFn, calls } = server({})
  const target = { baseUrl: "http://quiet/v1", model: "m" }
  expect(await resolveContextWindow(target, fetchFn)).toEqual({ tokens: DEFAULT_CONTEXT_WINDOW, source: "fallback" })
  const asked = calls.length
  await resolveContextWindow(target, fetchFn)
  expect(calls.length).toBe(asked)
})

test("a probe that throws counts as no answer", async () => {
  const fetchFn = async () => {
    throw new Error("connection refused")
  }
  expect((await resolveContextWindow({ baseUrl: "http://down/v1", model: "m" }, fetchFn)).source).toBe("fallback")
})
