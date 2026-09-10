import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { setNasiChatResolver, setNasiFetchProxyOverride } from "../../src/features/nasi/chat"
import { cleanupModel, expectUnauthenticated, fakeChatClient, seedModel, signUpAndSignIn } from "./helpers"

const turnRequestInit = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "hi" })
}

/** Captures the `messages` array passed to `stream()` (i.e. the system prompt included) so a test can assert on prompt content, while still replying normally. */
function capturingChatClient(reply: string, onMessages: (messages: unknown[]) => void) {
  return {
    chat: {
      completions: {
        stream: (opts: { messages: unknown[] }) => {
          onMessages(opts.messages)
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: reply } }] }
            },
            finalChatCompletion: async () => ({
              choices: [{ message: { role: "assistant", content: reply } }]
            })
          }
        }
      }
    }
  }
}

/** A resolver whose one round always calls `fetch_url` on a non-public URL, so `fetchUrlTool` throws `ToolError("fetch_url", …)` uncaught into `run()` — reproducing a tool failure mid-turn. */
function fetchUrlToolCallChatClient() {
  return {
    chat: {
      completions: {
        stream: () => ({
          async *[Symbol.asyncIterator]() {},
          finalChatCompletion: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: { name: "fetch_url", arguments: JSON.stringify({ url: "http://localhost/x" }) }
                    }
                  ]
                }
              }
            ]
          })
        })
      }
    }
  }
}

/** Stubs the nasi chat resolver with `client` for the duration of `fn`, then restores the default fake resolver. Also sets a proxy so proxy-gated tools (fetch_url) are present — no proxy is contacted, since these turns fail before any connection. */
async function withStubbedResolver<T>(client: unknown, fn: () => Promise<T>) {
  setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
  setNasiFetchProxyOverride("http://proxy.invalid:8080")
  try {
    return await fn()
  } finally {
    setNasiFetchProxyOverride(undefined)
    setNasiChatResolver(async () => ({ client: fakeChatClient("hello from nasi") as never, model: "fake-model" }))
  }
}

describe("nasi", () => {
  const email = faker.internet.email()
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string

  beforeAll(async () => {
    setNasiChatResolver(async () => ({
      client: fakeChatClient("hello from nasi") as never,
      model: "fake-model"
    }))
    token = await signUpAndSignIn(email, password, "Nasi Tester")
  })

  afterAll(() => {
    setNasiChatResolver(undefined)
  })

  test("unauthenticated turn is 401", () => expectUnauthenticated("/nasi/turn", turnRequestInit))

  test("turn creates a uuidv7 session and returns the reply", async () => {
    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: "hi" })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe("hello from nasi")
    expect(body.status).toBe("completed")
    expect(body.session).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    const list = await app.request("/nasi/sessions", {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(list.status).toBe(200)
    const listed = await list.json()
    expect(listed.sessions[0].id).toBe(body.session)
  })

  test("unknown session is 404", async () => {
    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ session: "01900000-0000-7000-8000-00000000dead", message: "hi" })
    })
    expect(res.status).toBe(404)
  })

  test("a tool error surfaces the real reason, not a generic message", async () => {
    await withStubbedResolver(fetchUrlToolCallChatClient(), async () => {
      const res = await app.request("/nasi/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: "fetch something" })
      })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBe("fetch_url: Blocked non-public URL: http://localhost/x")
    })
  })

  test("a non-English language request adds a reply-language instruction to the system prompt", async () => {
    let capturedMessages: unknown[] = []
    await withStubbedResolver(
      capturingChatClient("hello from nasi", messages => {
        capturedMessages = messages
      }),
      async () => {
        const res = await app.request("/nasi/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: "hi", language: "hu" })
        })
        expect(res.status).toBe(200)
        const system = capturedMessages.find(
          (m): m is { role: string; content: string } => (m as any).role === "system"
        )
        expect(system?.content).toContain("Hungarian")
      }
    )
  })

  test("no language field means no reply-language instruction", async () => {
    let capturedMessages: unknown[] = []
    await withStubbedResolver(
      capturingChatClient("hello from nasi", messages => {
        capturedMessages = messages
      }),
      async () => {
        const res = await app.request("/nasi/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: "hi" })
        })
        expect(res.status).toBe(200)
        const system = capturedMessages.find(
          (m): m is { role: string; content: string } => (m as any).role === "system"
        )
        expect(system?.content).not.toContain("Hungarian")
      }
    )
  })

  describe("turn/stream", () => {
    function parseSse(body: string): { event: string; data: string }[] {
      const events: { event: string; data: string }[] = []
      for (const block of body.split("\n\n")) {
        if (!block.trim()) continue
        const eventLine = block.split("\n").find(l => l.startsWith("event: "))
        const dataLine = block.split("\n").find(l => l.startsWith("data: "))
        if (eventLine && dataLine) events.push({ event: eventLine.slice(7), data: dataLine.slice(6) })
      }
      return events
    }

    test("unauthenticated stream is 401", () => expectUnauthenticated("/nasi/turn/stream", turnRequestInit))

    test("streams delta/message/final events then done with a uuidv7 session", async () => {
      const res = await app.request("/nasi/turn/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: "hi" })
      })
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toContain("text/event-stream")

      const events = parseSse(await res.text())
      const names = events.map(e => e.event)
      expect(names).toContain("delta")
      expect(names).toContain("final")
      expect(names[names.length - 1]).toBe("done")

      const done = JSON.parse(events[events.length - 1]!.data)
      expect(done.status).toBe("completed")
      expect(done.session).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

      const finalEvent = events.find(e => e.event === "final")!
      expect(JSON.parse(finalEvent.data).content).toBe("hello from nasi")
    })

    test("unknown session on stream emits an error event, not a 500", async () => {
      const res = await app.request("/nasi/turn/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session: "01900000-0000-7000-8000-00000000dead", message: "hi" })
      })
      expect(res.status).toBe(200)
      const events = parseSse(await res.text())
      expect(events.map(e => e.event)).toEqual(["error"])
      expect(JSON.parse(events[0]!.data).error).toBe("Session not found")
    })

    test("a tool error on stream emits a categorized error event with the real reason", async () => {
      await withStubbedResolver(fetchUrlToolCallChatClient(), async () => {
        const res = await app.request("/nasi/turn/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: "fetch something" })
        })
        expect(res.status).toBe(200)
        const events = parseSse(await res.text())
        expect(events.map(e => e.event)).toEqual(["tool_call", "error"])
        const errorBody = JSON.parse(events[1]!.data)
        expect(errorBody.error).toBe("fetch_url: Blocked non-public URL: http://localhost/x")
        expect(errorBody.category).toBe("tool")
      })
    })
  })

  describe("info", () => {
    let providerId: string

    beforeAll(async () => {
      ;({ providerId } = await seedModel("nasi-info-test"))
    })

    afterAll(async () => {
      await cleanupModel(providerId)
    })

    test("unauthenticated info is 401", () => expectUnauthenticated("/nasi/info"))

    test("returns persona label, a model, and the cloud tool list", async () => {
      const res = await app.request("/nasi/info", { headers: { Authorization: `Bearer ${token}` } })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.persona.id).toBeString()
      expect(body.persona.label).toBeString()
      expect(body.model).toBeString()
      expect(body.tools).toContain("ask_user")
      expect(body.tools).not.toContain("run_command")
    })

    test("pins the session's model on subsequent info lookups", async () => {
      // The turn resolver is stubbed to "fake-model" (not a seeded model row), so info's lookup-by-name
      // falls back to a fresh random pick — this only proves the pinned lookup path runs without erroring
      // for a session whose stored model isn't resolvable; see model.test.ts for the actual pin/fallback logic.
      const turn = await app.request("/nasi/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: "hi" })
      })
      const { session } = await turn.json()

      const info = await app.request(`/nasi/info?session=${session}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(info.status).toBe(200)
      const body = await info.json()
      expect(body.model).toBeString()
    })
  })
})
