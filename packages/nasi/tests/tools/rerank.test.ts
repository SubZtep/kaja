import { afterEach, expect, test } from "bun:test"
import { rerankTool } from "../../src/tools/builtin/rerank"
import { setToolDeps } from "../../src/tools/deps"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  setToolDeps({})
})

test("no rerank resolver configured: execute throws a ToolError", async () => {
  setToolDeps({})
  await expect(rerankTool.execute({ query: "q", documents: ["a"] })).rejects.toThrow("No rerank model configured")
})

test("resolver returning undefined for this persona (e.g. not pinned, no active fallback): execute throws", async () => {
  setToolDeps({ rerank: () => undefined })
  await expect(rerankTool.execute({ query: "q", documents: ["a"] }, { owner: null })).rejects.toThrow(
    "No rerank model configured"
  )
})

test("resolver's model for the given ctx.personaId is used in the outgoing request", async () => {
  let capturedUrl: string | undefined
  let capturedBody: any
  let capturedAuth: string | null = null
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url
    capturedBody = JSON.parse(init.body as string)
    capturedAuth = (init.headers as Record<string, string>).Authorization ?? null
    return new Response(
      JSON.stringify({
        object: "list",
        model: "persona-rerank-model",
        data: [{ index: 0, relevance_score: 0.9, document: "a" }],
        usage: { prompt_tokens: 1, total_tokens: 1 }
      }),
      { status: 200 }
    )
  }) as unknown as typeof fetch

  let seenPersonaId: string | undefined
  setToolDeps({
    rerank: personaId => {
      seenPersonaId = personaId
      return { model: "persona-rerank-model", baseUrl: "https://rerank.example.test", apiKey: "rerank-key" }
    }
  })

  await rerankTool.execute({ query: "q", documents: ["a"] }, { owner: null, personaId: "researcher" })

  expect(seenPersonaId).toBe("researcher")
  expect(capturedUrl).toBe("https://rerank.example.test/rerank")
  expect(capturedBody.model).toBe("persona-rerank-model")
  expect(capturedAuth as string | null).toBe("Bearer rerank-key")
})

test("no ctx (undefined personaId) still reaches the resolver, e.g. for the no-persona/active fallback case", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ object: "list", model: "m", data: [], usage: { prompt_tokens: 1, total_tokens: 1 } }),
      { status: 200 }
    )) as unknown as typeof fetch

  let seenPersonaId: string | undefined = "not-called"
  setToolDeps({
    rerank: personaId => {
      seenPersonaId = personaId
      return { model: "m", baseUrl: "https://rerank.example.test" }
    }
  })

  await rerankTool.execute({ query: "q", documents: [] })
  expect(seenPersonaId).toBeUndefined()
})
