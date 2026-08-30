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

describe("nasi", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "nasi-api-"))
  process.env.NASI_DATA_DIR = dataDir

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
})
