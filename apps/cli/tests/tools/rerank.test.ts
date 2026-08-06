import { afterEach, beforeEach, expect, test } from "bun:test"

process.env.XDG_CONFIG_HOME = `${import.meta.dir}/../../.tmp-test-xdg-config-rerank`

const { saveConfig } = await import("../../lib/config/config")
const { getModelsPath } = await import("../../lib/models/models")

await saveConfig({
  models: {
    chat: { model: "test-model", provider: "default" },
    rerank: { model: "accounts/fireworks/models/qwen3-reranker-8b", provider: "default" }
  }
})
await Bun.write(
  getModelsPath(),
  `
[providers.default]
default = true
base_url = "http://localhost/v1"
api_key = "llm-key"

[[models]]
id = "chat-default"
model = "test-model"
task = "chat"

[[models]]
id = "rerank-default"
model = "accounts/fireworks/models/qwen3-reranker-8b"
task = "rerank"
`
)

const { rerankTool } = await import("../../tools/rerank")

let lastRequest: { url: string; init: RequestInit } | undefined
const originalFetch = globalThis.fetch

beforeEach(() => {
  lastRequest = undefined
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    lastRequest = { url: url.toString(), init: init ?? {} }
    return new Response(
      JSON.stringify({
        object: "list",
        model: "accounts/fireworks/models/qwen3-reranker-8b",
        data: [
          { index: 1, relevance_score: 0.9, document: "b" },
          { index: 0, relevance_score: 0.1, document: "a" }
        ],
        usage: { prompt_tokens: 1, total_tokens: 2 }
      }),
      { status: 200 }
    )
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("rerank posts to the fireworks endpoint and returns ranked results", async () => {
  const result = await rerankTool.execute({
    query: "what is ai",
    documents: ["a", "b"]
  })
  expect(lastRequest?.url).toBe("http://localhost/v1/rerank")
  const body = JSON.parse(lastRequest!.init.body as string)
  expect(body.model).toBe("accounts/fireworks/models/qwen3-reranker-8b")
  expect(body.query).toBe("what is ai")
  expect(body.documents).toEqual(["a", "b"])
  expect((lastRequest!.init.headers as Record<string, string>).Authorization).toBe("Bearer llm-key")
  expect(JSON.parse(result as string)).toEqual([
    { index: 1, relevance_score: 0.9, document: "b" },
    { index: 0, relevance_score: 0.1, document: "a" }
  ])
})

test("rerank passes top_n through when given", async () => {
  await rerankTool.execute({
    query: "q",
    documents: ["a", "b"],
    top_n: 1
  })
  const body = JSON.parse(lastRequest!.init.body as string)
  expect(body.top_n).toBe(1)
})

test("rerank model resolves via its own provider, independent of chat", async () => {
  await Bun.write(
    getModelsPath(),
    `
[providers.default]
default = true
base_url = "http://localhost/v1"
api_key = "llm-key"

[providers.rerank-host]
base_url = "http://rerank-host/v1"
api_key = "rerank-key"

[[models]]
id = "chat-default"
model = "test-model"
task = "chat"

[[models]]
id = "rerank-default"
model = "custom-reranker"
task = "rerank"
provider = "rerank-host"
`
  )
  await saveConfig({
    models: {
      chat: { model: "test-model", provider: "default" },
      rerank: { model: "custom-reranker", provider: "rerank-host" }
    }
  })
  await rerankTool.execute({ query: "q", documents: ["a"] })
  expect(lastRequest?.url).toBe("http://rerank-host/v1/rerank")
  const body = JSON.parse(lastRequest!.init.body as string)
  expect(body.model).toBe("custom-reranker")
  expect((lastRequest!.init.headers as Record<string, string>).Authorization).toBe("Bearer rerank-key")
})
