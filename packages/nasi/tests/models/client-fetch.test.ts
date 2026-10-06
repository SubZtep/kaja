import { expect, test } from "bun:test"
import { createOpenAIClient } from "../../src/models/client"
import { clearContextWindowCache, DEFAULT_CONTEXT_WINDOW, resolveContextWindow } from "../../src/models/context-window"
import { createGuardedFetch } from "../../src/security/ssrf"

test("createOpenAIClient sends the request through the fetch it is given", async () => {
  let seen: string | undefined
  const openai = createOpenAIClient({
    baseURL: "http://127.0.0.1:9/v1",
    apiKey: "k",
    headers: { "x-test-key": "present" },
    fetch: async (input, init) => {
      seen = new Headers(init?.headers).get("x-test-key") ?? undefined
      expect(String(input)).toContain("127.0.0.1")
      return Response.json({ object: "list", data: [] })
    }
  })
  await openai.models.list()
  expect(seen).toBe("present")
})

test("a guarded model fetch never reaches a loopback host", async () => {
  let reached = false
  const origin = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      reached = true
      return Response.json({ object: "list", data: [] })
    }
  })
  const guarded = createGuardedFetch()
  try {
    const openai = createOpenAIClient({
      baseURL: `http://127.0.0.1:${origin.port}/v1`,
      apiKey: "k",
      fetch: (input, init) => guarded(input instanceof Request ? input.url : input, init)
    })
    // The SDK retries, then wraps the guard's refusal as a connection error. The loopback server must not see the request.
    let message = ""
    try {
      await openai.models.list()
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toContain("Connection error")
    expect(reached).toBe(false)
  } finally {
    await origin.stop(true)
  }
})

test("a context-window probe through the guarded fetch does not touch loopback", async () => {
  clearContextWindowCache()
  let reached = false
  const origin = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      reached = true
      return Response.json({ n_ctx: 999 })
    }
  })
  const guarded = createGuardedFetch()
  try {
    const window = await resolveContextWindow(
      { baseUrl: `http://127.0.0.1:${origin.port}/v1`, model: "m" },
      (input, init) => guarded(input, init)
    )
    expect(window).toEqual({ tokens: DEFAULT_CONTEXT_WINDOW, source: "fallback" })
    expect(reached).toBe(false)
  } finally {
    await origin.stop(true)
  }
})
