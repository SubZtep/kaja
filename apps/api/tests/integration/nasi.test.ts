import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { setNasiChatResolver } from "../../src/features/nasi/chat"

function fakeChatClient(reply: string) {
  return {
    chat: {
      completions: {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield { choices: [{ delta: { content: reply } }] }
          },
          finalChatCompletion: async () => ({
            choices: [{ message: { role: "assistant", content: reply } }]
          })
        })
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

describe("nasi", () => {
  const email = faker.internet.email()
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string

  beforeAll(async () => {
    setNasiChatResolver(async () => ({
      client: fakeChatClient("hello from nasi") as never,
      model: "fake-model"
    }))
    const signUp = await app.request("/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Nasi Tester" })
    })
    expect(signUp.ok).toBeTrue()
    const signIn = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    token = (await signIn.json()).token
  })

  afterAll(() => {
    setNasiChatResolver(undefined)
  })

  test("unauthenticated turn is 401", async () => {
    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    })
    expect(res.status).toBe(401)
  })

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
    setNasiChatResolver(async () => ({ client: fetchUrlToolCallChatClient() as never, model: "fake-model" }))
    try {
      const res = await app.request("/nasi/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: "fetch something" })
      })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBe("fetch_url: Blocked non-public URL: http://localhost/x")
    } finally {
      setNasiChatResolver(async () => ({ client: fakeChatClient("hello from nasi") as never, model: "fake-model" }))
    }
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

    test("unauthenticated stream is 401", async () => {
      const res = await app.request("/nasi/turn/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" })
      })
      expect(res.status).toBe(401)
    })

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
      setNasiChatResolver(async () => ({ client: fetchUrlToolCallChatClient() as never, model: "fake-model" }))
      try {
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
      } finally {
        setNasiChatResolver(async () => ({ client: fakeChatClient("hello from nasi") as never, model: "fake-model" }))
      }
    })
  })

  describe("info", () => {
    let providerId: string
    const modelName = `nasi-info-test-${faker.string.alphanumeric(8)}`

    beforeAll(async () => {
      const provider = await pool.query<{ id: string }>(
        "INSERT INTO provider (name, base_url) VALUES ($1, $2) RETURNING id",
        [`nasi-info-test-${faker.string.alphanumeric(8)}`, "http://localhost:1"]
      )
      providerId = provider.rows[0]!.id
      await pool.query("INSERT INTO model (provider_id, model, tasks, enabled, free) VALUES ($1, $2, $3, true, true)", [
        providerId,
        modelName,
        ["chat"]
      ])
    })

    afterAll(async () => {
      await pool.query("DELETE FROM provider WHERE id = $1", [providerId])
    })

    test("unauthenticated info is 401", async () => {
      const res = await app.request("/nasi/info")
      expect(res.status).toBe(401)
    })

    test("returns persona label, a model, and the hosted tool list", async () => {
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
