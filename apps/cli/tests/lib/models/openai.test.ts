import { expect, test } from "bun:test"

// lib/models/openai.ts does `const { models } = await config()` and
// `const { zen } = await services()` at its own module top level, so the
// module-scope `client` singleton depends on whichever test file's fixtures
// happened to be in place at first import across the whole `bun test` run
// (see the same note in tests/lib/agent/agents.test.ts). createOpenAIClient
// itself takes all inputs as parameters, so it's tested directly here
// instead of relying on that load-order-sensitive singleton.
const { createOpenAIClient } = await import("../../../lib/models/openai")

test("createOpenAIClient merges custom headers into outgoing requests", async () => {
  let seenHeaders: Headers | undefined
  const openai = createOpenAIClient({
    baseURL: "http://localhost/v1",
    apiKey: "unused",
    headers: { "x-kaja-zen-key": "sk-custom" }
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seenHeaders = new Headers(init?.headers)
    return new Response("{}", { status: 200 })
  }) as typeof fetch
  try {
    await openai.chat.completions.create({ model: "x", messages: [] }).catch(() => {})
  } finally {
    globalThis.fetch = originalFetch
  }
  expect(seenHeaders?.get("x-kaja-zen-key")).toBe("sk-custom")
})

test("createOpenAIClient without headers leaves outgoing requests unchanged", async () => {
  let seenHeaders: Headers | undefined
  const openai = createOpenAIClient({ baseURL: "http://localhost/v1", apiKey: "unused" })
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seenHeaders = new Headers(init?.headers)
    return new Response("{}", { status: 200 })
  }) as typeof fetch
  try {
    await openai.chat.completions.create({ model: "x", messages: [] }).catch(() => {})
  } finally {
    globalThis.fetch = originalFetch
  }
  expect(seenHeaders?.get("x-kaja-zen-key")).toBeNull()
})
