import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
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

describe("widget", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "widget-api-"))
  process.env.NASI_DATA_DIR = dataDir

  const email = faker.internet.email()
  const password = faker.internet.password({ length: 8, prefix: "P4$s" })
  let token: string
  let rawKey: string
  const allowedOrigin = "https://example-site.test"

  beforeAll(async () => {
    setNasiChatResolver(async () => ({
      client: fakeChatClient("hello from widget") as never,
      model: "fake-model"
    }))
    const signUp = await app.request("/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Widget Tester" })
    })
    expect(signUp.ok).toBeTrue()
    const signIn = await app.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    token = (await signIn.json()).token

    const createKey = await app.request("/widget-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: "Test widget", allowedOrigins: [allowedOrigin] })
    })
    expect(createKey.status).toBe(201)
    rawKey = (await createKey.json()).rawKey
    expect(rawKey).toStartWith("kwk_")
  })

  afterAll(() => {
    setNasiChatResolver(undefined)
  })

  test("missing widget key is 401", async () => {
    const res = await app.request("/widget/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: allowedOrigin },
      body: JSON.stringify({ message: "hi", visitorId: "v1" })
    })
    expect(res.status).toBe(401)
  })

  test("mismatched origin is 403", async () => {
    const res = await app.request("/widget/turn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://attacker.test",
        "x-kaja-widget-key": rawKey
      },
      body: JSON.stringify({ message: "hi", visitorId: "v1" })
    })
    expect(res.status).toBe(403)
  })

  test("valid key + allowed origin returns the reply and reflects CORS", async () => {
    const res = await app.request("/widget/turn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: allowedOrigin,
        "x-kaja-widget-key": rawKey
      },
      body: JSON.stringify({ message: "hi", visitorId: "v1" })
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe(allowedOrigin)
    const body = await res.json()
    expect(body.message).toBe("hello from widget")
    expect(body.status).toBe("completed")
  })

  test("two visitors on the same key cannot resume each other's session", async () => {
    const first = await app.request("/widget/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: allowedOrigin, "x-kaja-widget-key": rawKey },
      body: JSON.stringify({ message: "hi", visitorId: "visitor-a" })
    })
    const { session } = await first.json()

    const hijack = await app.request("/widget/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: allowedOrigin, "x-kaja-widget-key": rawKey },
      body: JSON.stringify({ session, message: "hijack attempt", visitorId: "visitor-b" })
    })
    expect(hijack.status).toBe(404)
  })

  test("revoked key is rejected", async () => {
    const list = await app.request("/widget-keys", { headers: { Authorization: `Bearer ${token}` } })
    const { keys } = await list.json()
    const revoke = await app.request(`/widget-keys/${keys[0].id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(revoke.status).toBe(200)

    const res = await app.request("/widget/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: allowedOrigin, "x-kaja-widget-key": rawKey },
      body: JSON.stringify({ message: "hi", visitorId: "v1" })
    })
    expect(res.status).toBe(401)
  })
})
