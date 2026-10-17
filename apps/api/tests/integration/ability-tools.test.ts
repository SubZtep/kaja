import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { setNasiChatResolver, setNasiEgressOverride } from "../../src/features/nasi/chat"
import { createCloudTelegramDriver, type TelegramButton } from "../../src/features/telegram/driver"
import { abilityService, marketplaceService, secretService } from "../../src/services"
import { noisyPng } from "../fixtures/images"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const weather = `weather-${tag}`
const issues = `issues-${tag}`
const extras = `extras-${tag}`
const forecastTool = `forecast_${tag}`
const createIssueTool = `create_issue_${tag}`
const TEST_SECRET_KEY = Buffer.alloc(32, 7).toString("base64")
const GOOD_KEY = `good-key-${tag}`

const host = (name: string) => `api.${name}.test`

function manifest(name: string, body: string) {
  return `description = "The ${name} API"\nbaseUrl = "https://${host(name)}"\n${body}`
}

/** A marketplace folder with three valid tools, one that calls a private host and one broken manifest. */
function marketplace(base: string) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  put(
    `abilities/${weather}/tool.toml`,
    manifest(weather, `[[tools]]\nname = "${forecastTool}"\ndescription = "Forecast"\npath = "/forecast"\n`)
  )
  put(
    `abilities/${issues}/tool.toml`,
    manifest(
      issues,
      `auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer " }\ncheck = { path = "/me" }\n` +
        `[[tools]]\nname = "${createIssueTool}"\ndescription = "File an issue"\nmethod = "POST"\npath = "/issues"\n` +
        `[tools.parameters]\ntype = "object"\n[tools.parameters.properties.title]\ntype = "string"\n`
    )
  )
  put(
    `abilities/${extras}/tool.toml`,
    manifest(
      extras,
      `auth = { type = "apiKey", in = "query", name = "key", keyless = true }\n` +
        `[[tools]]\nname = "extras_${tag}"\ndescription = "Extras"\npath = "/extras"\n`
    )
  )
  put(
    `abilities/private-${tag}/tool.toml`,
    `description = "Local"\nbaseUrl = "http://127.0.0.1:9"\n[[tools]]\nname = "p_${tag}"\ndescription = "x"\npath = "/"\n`
  )
  put(`abilities/broken-${tag}/tool.toml`, `description = "Broken"\n`)
  // Personas fix what a turn may use; the default one here uses every tool in the folder.
  const all = [weather, issues, extras, `private-${tag}`]
  put("personas/default.toml", `label = "Default"\nabilities = ${JSON.stringify(all)}\n`)
  return root
}

type SentRequest = { url: string; method: string; authorization: string | null; body?: string }

/** Chat client that plays `script` (one assistant message per model call) and records what each call was sent. */
function scriptedChat(
  script: { content: string | null; tool_calls?: unknown[]; throws?: string }[],
  sent: { tools?: { function: { name: string } }[]; messages: { role: string; content?: unknown }[] }[]
) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: never) => {
          sent.push(structuredClone(params))
          const message = script[i++] ?? { content: "done" }
          if (message.throws) throw new Error(message.throws)
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", ...message } }] })
          }
        }
      }
    }
  }
}

const createIssueCall = (id: string) => ({
  id,
  type: "function",
  function: { name: createIssueTool, arguments: JSON.stringify({ title: "Bug" }) }
})

/** The stored tool call for a provider call id, with the approval it got and the text of its result message. */
async function savedCall(callId: string) {
  const { rows } = await pool.query(
    `SELECT tc.approval, tc.status, tc.duration_ms IS NOT NULL AS timed, r.content AS result
     FROM nasi_tool_call tc LEFT JOIN nasi_message r ON r.id = tc.result_message_id
     WHERE tc.call_id = $1`,
    [callId]
  )
  return rows[0]
}

describe("HTTP tools in the cloud", () => {
  let base: string
  let token: string
  let userId: string
  let adminToken: string
  const adminEmail = faker.internet.email().toLowerCase()
  const requests: SentRequest[] = []
  const realFetch = globalThis.fetch
  const auth = (as = token) => ({ Authorization: `Bearer ${as}`, "Content-Type": "application/json" })
  // Server-wide keys, the only kind: an admin saves them and every user's turns use them.
  const saveKey = (name: string, apiKey: string, as = adminToken) =>
    app.request(`/admin/abilities/keys/${name}`, {
      method: "PUT",
      headers: auth(as),
      body: JSON.stringify({ apiKey })
    })
  const removeKey = (name: string) =>
    app.request(`/admin/abilities/keys/${name}`, { method: "DELETE", headers: auth(adminToken) })
  const keyList = async () => (await app.request("/admin/abilities/keys", { headers: auth(adminToken) })).json()
  const listed = async (name: string) =>
    (await keyList()).abilities.find((ability: { name: string }) => ability.name === name)
  const turn = (body: object) =>
    app.request("/nasi/turn", { method: "POST", headers: auth(), body: JSON.stringify(body) })
  const useScript = (script: Parameters<typeof scriptedChat>[0]) => {
    const sent: Parameters<typeof scriptedChat>[1] = []
    // One client for every turn that follows, so the script carries on across turns.
    const client = scriptedChat(script, sent)
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    return sent
  }

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "kaja-ability-tools-test-"))
    const email = faker.internet.email().toLowerCase()
    token = await signUpAndSignIn(email, "Tools")
    userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id
    adminToken = await signUpAndSignIn(adminEmail, "Keys Admin")
    await pool.query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [adminEmail])
    secretService.setKey(TEST_SECRET_KEY)
    // With a sender set, the SSRF guard leaves DNS to it, so the fake hosts below are reachable through the faked fetch.
    setNasiEgressOverride(() => () => (url, init) => fetch(url, init))
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (!url.hostname.endsWith(".test")) return realFetch(input, init)
      const authorization = new Headers(init?.headers).get("authorization")
      requests.push({ url: url.toString(), method: init?.method ?? "GET", authorization, body: init?.body as string })
      if (url.pathname === "/me")
        return new Response(null, { status: authorization === `Bearer ${GOOD_KEY}` ? 200 : 401 })
      if (url.pathname === "/issues") return Response.json({ id: 7 }, { status: 201 })
      return Response.json({ ok: true })
    }) as typeof fetch
  })

  afterAll(async () => {
    globalThis.fetch = realFetch
    secretService.setKey(env.USER_SECRET_KEY)
    setNasiEgressOverride(undefined)
    setNasiChatResolver(undefined)
    for (const name of [issues, extras]) await secretService.deleteService(`ability:${name}`)
    await pool.query('DELETE FROM "user" WHERE email = $1', [adminEmail])
    await pool.query("DELETE FROM ability WHERE name LIKE $1", [`%-${tag}`])
    // The fixture's default persona too, so later files get the built-in one again.
    await pool.query("DELETE FROM ability WHERE type = 'persona' AND name = 'default'")
    // The sync below marked the real marketplace's tools removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds tools by their marketplace path; broken ones and ones that call a private host are skipped", async () => {
    const result = await marketplaceService.syncFromDir(marketplace(base), "t1")
    expect(result.added).toEqual(
      expect.arrayContaining([
        `abilities/${weather}/tool.toml`,
        `abilities/${issues}/tool.toml`,
        `abilities/${extras}/tool.toml`
      ])
    )
    expect(result.added.join()).not.toContain(`private-${tag}`)
    expect(result.added.join()).not.toContain(`broken-${tag}`)
  })

  test("the admin's keys list shows each keyed tool: where it calls and whether it needs the key", async () => {
    expect(await listed(issues)).toMatchObject({ key: "required", domain: host(issues), saved: false })
    expect(await listed(extras)).toMatchObject({ key: "optional", saved: false })
    // It takes no key
    expect(await listed(weather)).toBeUndefined()
  })

  test("a tool that needs a key stays out of turns until an admin saves one; a saved key is tested and never sent back", async () => {
    const sent = useScript([{ content: "Hi." }])
    await turn({ message: "hi" })
    const offered = sent[0]!.tools!.map(t => t.function.name)
    expect(offered).toContain(forecastTool)
    expect(offered).not.toContain(createIssueTool)

    // Users can't save keys, only admins
    expect((await saveKey(issues, GOOD_KEY, token)).status).toBe(403)
    expect(await (await saveKey(issues, "wrong-key")).json()).toEqual({ check: { ok: false, reason: "HTTP 401" } })
    expect(await (await saveKey(issues, GOOD_KEY)).json()).toEqual({ check: { ok: true } })
    expect(requests.at(-1)).toMatchObject({ url: `https://${host(issues)}/me`, authorization: `Bearer ${GOOD_KEY}` })

    const list = await keyList()
    expect(list.keysEnabled).toBe(true)
    expect(await listed(issues)).toMatchObject({ key: "required", saved: true })
    expect(JSON.stringify(list)).not.toContain(GOOD_KEY)
    const { rows } = await pool.query("SELECT ciphertext FROM service_secret WHERE name = $1", [`ability:${issues}`])
    expect(Buffer.from(rows[0].ciphertext).toString("utf8")).not.toContain(GOOD_KEY)
    expect((await abilityService.serviceKeys()).get(issues)).toEqual({ value: GOOD_KEY, own: false })

    expect((await saveKey(weather, "x")).status).toBe(400)
    expect(await (await saveKey(extras, "extra-key")).json()).toEqual({ check: null })
    expect((await saveKey("nope-nope", "x")).status).toBe(404)
  })

  test("a cloud turn gets the persona's tools; a POST waits for approval, and approving runs the call the server saved", async () => {
    const sent = useScript([{ content: null, tool_calls: [createIssueCall("call_a")] }, { content: "Filed #7." }])
    requests.length = 0

    const first = await turn({ message: "file a bug" })
    const paused = await first.json()
    expect(paused.status).toBe("needs_approval")
    expect(sent[0]!.tools!.map(t => t.function.name)).toEqual(expect.arrayContaining([forecastTool, createIssueTool]))
    expect(paused.steps).toContainEqual({
      type: "confirm_tool",
      name: createIssueTool,
      arguments: '{"title":"Bug"}',
      summary: `POST https://${host(issues)}/issues {"title":"Bug"}`
    })
    expect(JSON.stringify(paused)).not.toContain(GOOD_KEY)
    expect(requests).toEqual([])

    const done = await (await turn({ session: paused.session, approval: "approve" })).json()
    expect(done).toMatchObject({ status: "completed", message: "Filed #7." })
    expect(requests).toEqual([
      {
        url: `https://${host(issues)}/issues`,
        method: "POST",
        authorization: `Bearer ${GOOD_KEY}`,
        body: '{"title":"Bug"}'
      }
    ])
    expect(sent[1]!.messages.at(-1)).toMatchObject({ role: "tool", content: 'HTTP 201\n\n{"id":7}' })
    expect(await savedCall("call_a")).toEqual({
      approval: "approved",
      status: "ok",
      timed: true,
      result: 'HTTP 201\n\n{"id":7}'
    })

    const again = await turn({ session: paused.session, approval: "approve" })
    expect(again.status).toBe(409)
    expect((await turn({ session: paused.session })).status).toBe(400)

    const { providerId } = await seedModel("ability-tools-info")
    try {
      const info = await (await app.request("/nasi/info", { headers: auth() })).json()
      expect(info.tools).toEqual(expect.arrayContaining([forecastTool, createIssueTool]))
    } finally {
      await cleanupModel(providerId)
    }
  })

  test("'approve for this session' stops asking about that tool in the session, and only there", async () => {
    useScript([
      { content: null, tool_calls: [createIssueCall("call_s1")] },
      { content: null, tool_calls: [createIssueCall("call_s2")] },
      { content: "Filed twice." },
      { content: null, tool_calls: [createIssueCall("call_s3")] }
    ])
    requests.length = 0
    const paused = await (await turn({ message: "file two bugs" })).json()
    expect(paused.status).toBe("needs_approval")
    const done = await (await turn({ session: paused.session, approval: "approve_session" })).json()
    // The second call ran without asking
    expect(done).toMatchObject({ status: "completed", message: "Filed twice." })
    expect(requests.filter(request => request.method === "POST")).toHaveLength(2)
    // A different session asks again
    expect((await (await turn({ message: "another bug" })).json()).status).toBe("needs_approval")
  })

  test("the stream forwards confirm_tool, and declining never calls the tool", async () => {
    const sent = useScript([{ content: null, tool_calls: [createIssueCall("call_b")] }, { content: "Not filed." }])
    requests.length = 0
    const stream = await app.request("/nasi/turn/stream", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ message: "file a bug" })
    })
    const text = await stream.text()
    expect(text).toContain("event: confirm_tool")
    const session = JSON.parse(/event: done\ndata: (.+)/.exec(text)![1]!).session

    const declined = await (await turn({ session, approval: "decline" })).json()
    expect(declined.message).toBe("Not filed.")
    expect(sent[1]!.messages.at(-1)).toMatchObject({ role: "tool", content: "User declined this request." })
    expect(requests).toEqual([])
    expect(await savedCall("call_b")).toEqual({
      approval: "declined",
      status: "declined",
      timed: false,
      result: "User declined this request."
    })
  })

  test("the Telegram bot asks with buttons; only a matching press from the same user runs the call", async () => {
    useScript([{ content: null, tool_calls: [createIssueCall("call_t")] }, { content: "Filed from Telegram." }])
    requests.length = 0
    const messages: { id: number; text: string; buttons?: TelegramButton[][] }[] = []
    const edits: { id: number; text: string }[] = []
    const driver = createCloudTelegramDriver({
      resolveLinkedUser: async telegramUserId => (telegramUserId === 1001 ? { userId, locale: null } : undefined),
      sender: {
        async sendMessage(_chatId, text, buttons) {
          messages.push({ id: messages.length + 1, text, buttons })
          return { messageId: messages.length }
        },
        async editMessageText(_chatId, messageId, text) {
          edits.push({ id: messageId, text })
        },
        async deleteMessage() {},
        async sendPhoto() {
          return { messageId: 2 }
        },
        async editCaption() {}
      }
    })

    await driver.handleMessage(1001, 55, "file a bug")
    const prompt = messages.find(message => message.buttons)!
    expect(prompt.text).toContain(createIssueTool)
    expect(prompt.buttons!.flat().map(button => button.data)).toEqual([
      expect.stringMatching(/^tool:approve:[0-9a-f]{16}$/),
      expect.stringMatching(/^tool:decline:[0-9a-f]{16}$/),
      expect.stringMatching(/^tool:approve_session:[0-9a-f]{16}$/)
    ])
    const approve = prompt.buttons![0]![0]!.data

    // Someone else pressing it, or a made-up token, does nothing.
    expect(await driver.handleCallback(2002, 55, prompt.id, approve)).toBe(true)
    await driver.handleCallback(1001, 55, prompt.id, "tool:approve:0000000000000000")
    expect(edits.at(-1)).toEqual({ id: prompt.id, text: "This request was already answered or has expired." })
    expect(requests).toEqual([])
    expect(await driver.handleCallback(1001, 55, prompt.id, "link:confirm:x")).toBe(false)

    await driver.handleCallback(1001, 55, prompt.id, approve)
    expect(edits.find(edit => edit.id === prompt.id && edit.text.includes("Approved"))).toBeDefined()
    expect(requests).toEqual([expect.objectContaining({ method: "POST", authorization: `Bearer ${GOOD_KEY}` })])
    expect(edits.at(-1)!.text).toContain("Filed from Telegram.")

    // The same button again is stale.
    await driver.handleCallback(1001, 55, prompt.id, approve)
    expect(edits.at(-1)).toEqual({ id: prompt.id, text: "This request was already answered or has expired." })
    expect(requests).toHaveLength(1)
  })

  test("the Telegram bot sends a reply's Markdown images as photos after its text, public URLs only", async () => {
    useScript([
      { content: "Here: ![A cat](https://example.com/cat.jpg) ![Server file](/etc/passwd.png)" },
      { content: "![](https://example.com/dog.jpg)" }
    ])
    const edits: string[] = []
    const photos: { url: string | Uint8Array; caption?: string }[] = []
    const driver = createCloudTelegramDriver({
      resolveLinkedUser: async telegramUserId => (telegramUserId === 1001 ? { userId, locale: null } : undefined),
      sender: {
        async sendMessage() {
          return { messageId: 1 }
        },
        async editMessageText(_chatId, _messageId, text) {
          edits.push(text)
        },
        async deleteMessage() {},
        async sendPhoto(_chatId, url, caption) {
          photos.push({ url, caption })
          return { messageId: 2 }
        },
        async editCaption() {}
      }
    })

    await driver.handleMessage(1001, 55, "/new")
    await driver.handleMessage(1001, 55, "show me a cat")
    expect(edits.at(-1)).toBe("Here: A cat Server file")
    expect(photos).toEqual([{ url: "https://example.com/cat.jpg", caption: "A cat" }])

    // Only an image: no text to show, so the placeholder marks the photo instead of saying the reply was empty
    await driver.handleMessage(1001, 55, "and a dog")
    expect(edits.at(-1)).toBe("📷")
    expect(photos.at(-1)).toEqual({ url: "https://example.com/dog.jpg", caption: undefined })
  })

  test("a photo sent to the Telegram bot reaches the model with its caption, even one that looks like a command", async () => {
    const photo = `data:image/png;base64,${noisyPng(2, 2).toString("base64")}`
    const sent = useScript([{ content: "A cat." }])
    const driver = createCloudTelegramDriver({
      resolveLinkedUser: async telegramUserId => (telegramUserId === 1001 ? { userId, locale: null } : undefined),
      sender: {
        async sendMessage() {
          return { messageId: 1 }
        },
        async editMessageText() {},
        async deleteMessage() {},
        async sendPhoto() {
          return { messageId: 2 }
        },
        async editCaption() {}
      }
    })

    await driver.handleMessage(1001, 55, "/new")
    await driver.handleMessage(1001, 55, "/new", undefined, [photo])
    expect(sent[0]!.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "/new" },
        {
          type: "text",
          text: expect.stringMatching(/^\[Image kaja-image:[0-9a-f]{16} \(2×2\): an image the user sent]$/)
        },
        { type: "image_url", image_url: { url: photo } }
      ]
    })
    const { rows } = await pool.query(
      "SELECT title FROM nasi_session WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    )
    expect(rows[0].title).toBe("📷 /new")
  })

  /** A cloud Telegram driver for user 1001 over a recording sender; `onSend` sees each sent message first. */
  function telegramDriver(onSend?: (text: string) => void) {
    const messages: { id: number; text: string; buttons?: TelegramButton[][] }[] = []
    const edits: { id: number; text: string }[] = []
    const deleted: number[] = []
    const driver = createCloudTelegramDriver({
      resolveLinkedUser: async telegramUserId => (telegramUserId === 1001 ? { userId, locale: null } : undefined),
      sender: {
        async sendMessage(_chatId, text, buttons) {
          onSend?.(text)
          messages.push({ id: messages.length + 1, text, buttons })
          return { messageId: messages.length }
        },
        async editMessageText(_chatId, messageId, text) {
          edits.push({ id: messageId, text })
        },
        async deleteMessage(_chatId, messageId) {
          deleted.push(messageId)
        },
        async sendPhoto() {
          return { messageId: 99 }
        },
        async editCaption() {}
      }
    })
    return { driver, messages, edits, deleted }
  }

  test("the Telegram bot keeps a round's text as its own message, and the answer follows in a new one", async () => {
    const forecast = { id: "call_f", type: "function", function: { name: forecastTool, arguments: "{}" } }
    useScript([{ content: "Let me check.", tool_calls: [forecast] }, { content: "Sunny." }])
    const { driver, messages, edits } = telegramDriver()

    await driver.handleMessage(1001, 55, "/new")
    await driver.handleMessage(1001, 55, "weather?")
    const placeholder = messages.find(message => message.text === "…")!
    expect(edits.filter(edit => edit.id === placeholder.id).at(-1)!.text).toBe("Let me check.")
    expect(messages.at(-1)!.text).toBe("Sunny.")
    expect(edits.some(edit => edit.text.includes("Let me check.Sunny."))).toBe(false)
  })

  test("the Telegram bot removes the empty placeholder before an approval, and keeps the prompt's text once answered", async () => {
    useScript([{ content: null, tool_calls: [createIssueCall("call_p")] }, { content: "Filed." }])
    const { driver, messages, edits, deleted } = telegramDriver()

    await driver.handleMessage(1001, 55, "/new")
    await driver.handleMessage(1001, 55, "file a bug")
    const placeholder = messages.find(message => message.text === "…")!
    expect(deleted).toEqual([placeholder.id])
    const prompt = messages.find(message => message.buttons)!
    await driver.handleCallback(1001, 55, prompt.id, prompt.buttons![0]![0]!.data, undefined, "🔐 create_issue <x>")
    expect(edits.find(edit => edit.id === prompt.id)!.text).toBe("🔐 create_issue &lt;x&gt;\n\n✅ Approved")
  })

  test("a message to the Telegram bot while a turn runs gets 'still working' instead of queueing", async () => {
    useScript([{ content: "First." }])
    let second: Promise<void> | undefined
    const { driver, messages } = telegramDriver(text => {
      // The placeholder goes out once the turn holds the user: a message now finds them busy
      if (text === "…" && !second) second = driver.handleMessage(1001, 55, "are you there?")
    })

    await driver.handleMessage(1001, 55, "/new")
    await driver.handleMessage(1001, 55, "hello")
    await second
    expect(messages.map(message => message.text)).toContain("Still working on your last message…")
  })

  test("a failed Telegram turn's error line is escaped for Telegram's HTML", async () => {
    useScript([{ content: null, throws: "<html>Bad Gateway</html> & more" }])
    const { driver, edits } = telegramDriver()

    await driver.handleMessage(1001, 55, "/new")
    await driver.handleMessage(1001, 55, "hello")
    expect(edits.at(-1)!.text).toBe("⚠ Something went wrong: &lt;html&gt;Bad Gateway&lt;/html&gt; &amp; more")
  })

  test("widget turns never get HTTP tools, even when their persona lists them", async () => {
    const origin = "https://tools-widget.test"
    const created = await app.request("/widget/admin", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ label: "w", allowedOrigins: [origin] })
    })
    const { rawKey } = await created.json()
    const sent = useScript([{ content: "hi" }])
    const res = await app.request("/widget/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin, "x-kaja-widget-key": rawKey },
      body: JSON.stringify({ message: "hi", visitorId: "v1" })
    })
    expect(res.status).toBe(200)
    const names = sent[0]!.tools?.map(t => t.function.name) ?? []
    expect(names).not.toContain(forecastTool)
    expect(names).not.toContain(createIssueTool)
  })

  test("a service key copied to another name doesn't decrypt", async () => {
    const copy = `ability:copy-${tag}`
    await pool.query(
      `INSERT INTO service_secret (name, ciphertext, iv, tag)
       SELECT $1, ciphertext, iv, tag FROM service_secret WHERE name = $2`,
      [copy, `ability:${issues}`]
    )
    try {
      const all = await secretService.getAllService("ability:")
      expect(all.get(`ability:${issues}`)).toBe(GOOD_KEY)
      expect(all.has(copy)).toBe(false)
    } finally {
      await secretService.deleteService(copy)
    }
  })

  test("removing the key takes a tool that can't work without it out of turns", async () => {
    expect((await removeKey(issues)).status).toBe(200)
    expect(await listed(issues)).toMatchObject({ saved: false })
    const sent = useScript([{ content: "Hi." }])
    await turn({ message: "hi" })
    const offered = sent[0]!.tools!.map(t => t.function.name)
    expect(offered).toContain(forecastTool)
    expect(offered).not.toContain(createIssueTool)
    expect((await removeKey("nope-nope")).status).toBe(404)
  })

  test("without USER_SECRET_KEY, key entry is off and tools that need a key are hidden", async () => {
    secretService.setKey(undefined)
    try {
      expect((await saveKey(extras, "x")).status).toBe(503)
      const list = await keyList()
      expect(list.keysEnabled).toBe(false)
      const names = list.abilities.map((ability: { name: string }) => ability.name)
      expect(names).toContain(extras)
      expect(names).not.toContain(issues)
    } finally {
      secretService.setKey(TEST_SECRET_KEY)
    }
  })
})
