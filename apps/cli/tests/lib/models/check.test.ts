import { afterAll, expect, test } from "bun:test"
import { checkModelAvailability } from "../../../lib/models/check"

// A tiny stand-in OpenAI-compatible server: chat completions and embeddings
// succeed only for "known-model" (mirrors a real provider rejecting an
// unserved model), /v1/models/:id (the speaches load-probe) succeeds only
// for "known-model", and /models lists only "known-tts-model" (mirrors the
// tts fallback path, which still uses the list endpoint).
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/chat/completions") {
      const body = (await req.json()) as { model: string }
      if (body.model === "known-model") {
        return Response.json({
          id: "x",
          choices: [{ message: { role: "assistant", content: "hi" } }]
        })
      }
      return new Response("model not found", { status: 404 })
    }
    if (url.pathname === "/embeddings") {
      const body = (await req.json()) as { model: string }
      if (body.model === "known-model") {
        return Response.json({
          data: [{ index: 0, embedding: [0.1, 0.2] }]
        })
      }
      return new Response("model not found", { status: 404 })
    }
    if (url.pathname.startsWith("/v1/models/")) {
      const id = decodeURIComponent(url.pathname.slice("/v1/models/".length))
      if (id === "known-model") return new Response(null, { status: 200 })
      return new Response("model not found", { status: 404 })
    }
    if (url.pathname === "/models") {
      return Response.json({
        data: [{ id: "known-tts-model", object: "model" }]
      })
    }
    return new Response("not found", { status: 404 })
  }
})
const baseUrl = `http://localhost:${server.port}`

afterAll(() => {
  server.stop()
})

test.each(["chat", "embedding", "speech-to-text"] as const)(
  "%s model: available when the provider request succeeds",
  async task => {
    const ok = await checkModelAvailability({
      model: "known-model",
      task,
      baseUrl,
      provider: "default"
    })
    expect(ok).toBe(true)
  }
)

test.each(["chat", "embedding", "speech-to-text"] as const)(
  "%s model: not available when the provider rejects the model id (even if absent from /models)",
  async task => {
    const ok = await checkModelAvailability({
      model: "unlisted-but-should-still-be-tested",
      task,
      baseUrl,
      provider: "default"
    })
    expect(ok).toBe(false)
  }
)

test("tts model: falls back to the /models list", async () => {
  const ok = await checkModelAvailability({
    model: "known-tts-model",
    task: "text-to-speech",
    baseUrl,
    provider: "default"
  })
  expect(ok).toBe(true)
})

test("tts model: not available when absent from /models", async () => {
  const ok = await checkModelAvailability({
    model: "missing-tts-model",
    task: "text-to-speech",
    baseUrl,
    provider: "default"
  })
  expect(ok).toBe(false)
})
