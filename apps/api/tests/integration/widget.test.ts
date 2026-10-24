import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { setNasiChatResolver } from "../../src/features/nasi/chat"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

const PLAYER_SOURCE = "export async function play(){ return { type: 'question', text: 'Is it red?' } }"

function chatClient(reply: string, seen: { model?: string; messages?: unknown }[] = []) {
  return {
    chat: {
      completions: {
        create: (params: { model: string; messages: unknown }) => {
          seen.push({ model: params.model, messages: params.messages })
          return Promise.resolve({
            choices: [{ message: { content: reply } }],
            usage: { prompt_tokens: 3, completion_tokens: 5 }
          })
        }
      }
    }
  }
}

describe("widget", () => {
  const email = faker.internet.email()
  let token: string
  let rawToken: string
  let widgetId: string
  let providerId: string
  let modelName: string
  const seen: { model?: string }[] = []

  beforeAll(async () => {
    ;({ providerId, modelName } = await seedModel("widget"))
    setNasiChatResolver(async () => ({
      client: chatClient(`\`\`\`js\n${PLAYER_SOURCE}\n\`\`\``, seen) as never,
      model: "fake-model"
    }))
    token = await signUpAndSignIn(email, "Widget Tester")
    const created = await app.request("/widget/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        label: "Player",
        intent: "Ask yes or no questions.",
        model: modelName,
        target: { kind: "server" }
      })
    })
    expect(created.status).toBe(201)
    const body = await created.json()
    rawToken = body.rawToken
    widgetId = body.id
    expect(rawToken).toStartWith("kwt_")
    expect(body.tokenPrefix).toBe(rawToken.slice(0, 12))
    expect(body.draft?.source).toBe(PLAYER_SOURCE)
    expect(body.draft?.error).toBeNull()
  })

  afterAll(async () => {
    setNasiChatResolver(undefined)
    await cleanupModel(providerId)
  })

  const widgetAuth = () => ({ Authorization: `Bearer ${rawToken}`, "Content-Type": "application/json" })

  test("the raw token is not listed again", async () => {
    const res = await app.request("/widget/admin", { headers: { Authorization: `Bearer ${token}` } })
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(rawToken)
    expect(body.widgets.find((widget: { id: string }) => widget.id === widgetId).tokenPrefix).toBe(
      rawToken.slice(0, 12)
    )
  })

  test("a user token cannot call the chat gateway", async () => {
    const res = await app.request("/ai/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
    })
    expect(res.status).toBe(401)
  })

  test("a widget token cannot manage widgets", async () => {
    const res = await app.request("/widget/admin", { headers: widgetAuth() })
    expect(res.status).toBe(401)
  })

  test("an unknown widget token is 401", async () => {
    const res = await app.request("/widget/me", { headers: { Authorization: `Bearer kwt_${"a".repeat(32)}` } })
    expect(res.status).toBe(401)
  })

  test("chat uses the pinned model and rejects an empty message list", async () => {
    seen.length = 0
    const missing = await app.request("/ai/chat", {
      method: "POST",
      headers: widgetAuth(),
      body: JSON.stringify({ messages: [] })
    })
    expect(missing.status).toBe(400)
    const res = await app.request("/ai/chat", {
      method: "POST",
      headers: widgetAuth(),
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], model: "other-model" })
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      message: `\`\`\`js\n${PLAYER_SOURCE}\n\`\`\``,
      usage: { promptTokens: 3, completionTokens: 5 }
    })
    expect(seen.at(-1)?.model).toBe(modelName)
  })

  test("state is isolated per widget and capped", async () => {
    const visitor = crypto.randomUUID()
    const put = await app.request(`/widget/state/${visitor}`, {
      method: "PUT",
      headers: widgetAuth(),
      body: JSON.stringify({ state: { phase: "idle" } })
    })
    expect(put.status).toBe(200)
    const got = await app.request(`/widget/state/${visitor}`, { headers: widgetAuth() })
    expect(await got.json()).toEqual({ state: { phase: "idle" } })
    const huge = await app.request(`/widget/state/${visitor}`, {
      method: "PUT",
      headers: widgetAuth(),
      body: JSON.stringify({ state: { blob: "x".repeat(20_000) } })
    })
    expect(huge.status).toBe(400)
  })

  test("unpublished source is 404 and publish then serves it", async () => {
    expect((await app.request("/widget/source", { headers: widgetAuth() })).status).toBe(404)
    const published = await app.request(`/widget/admin/${widgetId}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(published.status).toBe(200)
    const source = await app.request("/widget/source", { headers: widgetAuth() })
    expect(await source.json()).toMatchObject({ source: PLAYER_SOURCE })
  })

  test("a link requires the same owner and me does not leak the other token", async () => {
    const otherEmail = faker.internet.email()
    const other = await signUpAndSignIn(otherEmail, "Other")
    const foreign = await app.request("/widget/admin", {
      method: "POST",
      headers: { Authorization: `Bearer ${other}`, "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Foreign", intent: "Nope.", model: modelName, target: { kind: "server" } })
    })
    const foreignId = (await foreign.json()).id as string
    const refused = await app.request(`/widget/admin/${widgetId}/links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: foreignId })
    })
    expect(refused.status).toBe(404)

    const board = await app.request("/widget/admin", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Board",
        intent: "Show the question.",
        model: modelName,
        target: { kind: "browser", page: "home", selector: "#kaja-barkochba" }
      })
    })
    const boardBody = await board.json()
    const linked = await app.request(`/widget/admin/${boardBody.id}/links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: widgetId })
    })
    expect(linked.status).toBe(200)
    expect((await linked.json()).links).toEqual([widgetId])

    const me = await app.request("/widget/me", { headers: { Authorization: `Bearer ${boardBody.rawToken}` } })
    const meBody = await me.json()
    expect(meBody.links).toEqual([widgetId])
    expect(JSON.stringify(meBody)).not.toContain(rawToken)
    expect(meBody.source).toBeUndefined()

    const visitor = crypto.randomUUID()
    await app.request(`/widget/state/${visitor}`, {
      method: "PUT",
      headers: widgetAuth(),
      body: JSON.stringify({ state: { phase: "playing" } })
    })
    const fromBoard = await app.request(`/widget/state/${visitor}`, {
      headers: { Authorization: `Bearer ${boardBody.rawToken}` }
    })
    expect(await fromBoard.json()).toEqual({ state: null })
  })

  test("a draft that contains a token is refused and the published source stays", async () => {
    setNasiChatResolver(async () => ({
      client: chatClient("```js\nexport async function play(){ return { text: 'kwt_secret' } }\n```") as never,
      model: "fake-model"
    }))
    const generated = await app.request(`/widget/admin/${widgetId}/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    })
    const body = await generated.json()
    expect(body.draft.error).toContain("token")
    expect(body.published.source).toBe(PLAYER_SOURCE)
    const source = await app.request("/widget/source", { headers: widgetAuth() })
    expect((await source.json()).source).toBe(PLAYER_SOURCE)
  })

  test("discard leaves the published generation", async () => {
    const discarded = await app.request(`/widget/admin/${widgetId}/draft`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    })
    const body = await discarded.json()
    expect(body.draft).toBeNull()
    expect(body.published.source).toBe(PLAYER_SOURCE)
  })

  test("a revoked token is 401", async () => {
    const revoked = await app.request(`/widget/admin/${widgetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(revoked.status).toBe(200)
    expect((await app.request("/widget/me", { headers: widgetAuth() })).status).toBe(401)
  })
})
