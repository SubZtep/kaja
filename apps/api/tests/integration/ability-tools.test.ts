import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { setNasiChatResolver, setNasiFetchProxyOverride } from "../../src/features/nasi/chat"
import { createCloudTelegramDriver, type TelegramButton } from "../../src/features/telegram/driver"
import { marketplaceService, secretService } from "../../src/services"
import { AbilityService, parseAbilityKeys } from "../../src/services/ability"
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
  return `name = "${name}"\ndescription = "The ${name} API"\nbaseUrl = "https://${host(name)}"\n${body}`
}

/** A marketplace folder with three valid tools, one that calls a private host and one broken manifest. */
function marketplace(base: string) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  put(
    `tools/${weather}.toml`,
    manifest(weather, `[[tools]]\nname = "${forecastTool}"\ndescription = "Forecast"\npath = "/forecast"\n`)
  )
  put(
    `tools/${issues}.toml`,
    manifest(
      issues,
      `auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer " }\ncheck = { path = "/me" }\n` +
        `[[tools]]\nname = "${createIssueTool}"\ndescription = "File an issue"\nmethod = "POST"\npath = "/issues"\n` +
        `[tools.parameters]\ntype = "object"\n[tools.parameters.properties.title]\ntype = "string"\n`
    )
  )
  put(
    `tools/${extras}.toml`,
    manifest(
      extras,
      `auth = { type = "apiKey", in = "query", name = "key", optional = true }\n` +
        `[[tools]]\nname = "extras_${tag}"\ndescription = "Extras"\npath = "/extras"\n`
    )
  )
  put(
    `tools/private-${tag}.toml`,
    `name = "private-${tag}"\ndescription = "Local"\nbaseUrl = "http://127.0.0.1:9"\n[[tools]]\nname = "p_${tag}"\ndescription = "x"\npath = "/"\n`
  )
  put(`tools/broken-${tag}.toml`, `name = "broken-${tag}"\n`)
  return root
}

type SentRequest = { url: string; method: string; authorization: string | null; body?: string }

/** Chat client that plays `script` (one assistant message per model call) and records what each call was sent. */
function scriptedChat(
  script: { content: string | null; tool_calls?: unknown[] }[],
  sent: { tools?: { function: { name: string } }[]; messages: { role: string; content?: unknown }[] }[]
) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: never) => {
          sent.push(structuredClone(params))
          const message = script[i++] ?? { content: "done" }
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
  const requests: SentRequest[] = []
  const realFetch = globalThis.fetch
  const auth = (as = token) => ({ Authorization: `Bearer ${as}`, "Content-Type": "application/json" })
  const saveKey = (name: string, apiKey: string, as = token) =>
    app.request(`/abilities/me/tool/${name}/key`, {
      method: "PUT",
      headers: auth(as),
      body: JSON.stringify({ apiKey })
    })
  const enable = (type: string, name: string, as = token) =>
    app.request(`/abilities/me/${type}/${name}`, { method: "PUT", headers: auth(as) })
  const mine = async (as = token) => (await app.request("/abilities/me", { headers: auth(as) })).json()
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
    token = await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), "Tools")
    userId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id
    secretService.setKey(TEST_SECRET_KEY)
    // With a proxy set, the SSRF guard leaves DNS to the proxy, so the fake hosts below are reachable through the faked fetch.
    setNasiFetchProxyOverride("http://proxy.test:3128")
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
    setNasiFetchProxyOverride(undefined)
    setNasiChatResolver(undefined)
    await pool.query("DELETE FROM ability WHERE name LIKE $1", [`%-${tag}`])
    // The sync below marked the real marketplace's tools removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds tools by their marketplace path; broken ones and ones that call a private host are skipped", async () => {
    const result = await marketplaceService.syncFromDir(marketplace(base), "t1")
    expect(result.added).toEqual(expect.arrayContaining([`tools/${weather}`, `tools/${issues}`, `tools/${extras}`]))
    expect(result.added.join()).not.toContain(`private-${tag}`)
    expect(result.added.join()).not.toContain(`broken-${tag}`)
  })

  test("the catalog shows where each tool calls, whether it needs a key, and its methods", async () => {
    const { abilities } = await (await app.request("/abilities")).json()
    const byName = (name: string) => abilities.find((ability: { name: string }) => ability.name === name)
    expect(byName(weather)).toMatchObject({
      type: "tool",
      http: {
        domain: host(weather),
        key: "none",
        tools: [{ name: forecastTool, method: "GET", description: "Forecast" }]
      }
    })
    expect(byName(issues).http).toMatchObject({ key: "required", tools: [{ name: createIssueTool, method: "POST" }] })
    expect(byName(extras).http.key).toBe("optional")
  })

  test("a tool that needs a key can't be turned on without one; a saved key is tested and never sent back", async () => {
    const refused = await enable("tool", issues)
    expect(refused.status).toBe(400)
    expect((await refused.json()).error).toBe("key_required")

    expect(await (await saveKey(issues, "wrong-key")).json()).toEqual({ check: { ok: false, reason: "HTTP 401" } })
    expect(await (await saveKey(issues, GOOD_KEY)).json()).toEqual({ check: { ok: true } })
    expect(requests.at(-1)).toMatchObject({ url: `https://${host(issues)}/me`, authorization: `Bearer ${GOOD_KEY}` })

    const listed = await mine()
    expect(listed).toMatchObject({ keys: [issues], keysEnabled: true })
    expect(JSON.stringify(listed)).not.toContain(GOOD_KEY)
    const { rows } = await pool.query("SELECT ciphertext FROM user_secret WHERE user_id = $1", [userId])
    expect(Buffer.from(rows[0].ciphertext).toString("utf8")).not.toContain(GOOD_KEY)

    expect((await enable("tool", issues)).status).toBe(200)
    expect((await saveKey(weather, "x")).status).toBe(400)
    expect(await (await saveKey(extras, "extra-key")).json()).toEqual({ check: null })
    expect((await saveKey("nope-nope", "x")).status).toBe(404)
  })

  test("a cloud turn gets the user's tools; a POST waits for approval, and approving runs the call the server saved", async () => {
    expect((await enable("tool", weather)).status).toBe(200)
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
      resolveLinkedUserId: async telegramUserId => (telegramUserId === 1001 ? userId : undefined),
      sender: {
        async sendMessage(_chatId, text, buttons) {
          messages.push({ id: messages.length + 1, text, buttons })
          return { messageId: messages.length }
        },
        async editMessageText(_chatId, messageId, text) {
          edits.push({ id: messageId, text })
        }
      }
    })

    await driver.handleMessage(1001, 55, "file a bug")
    const prompt = messages.find(message => message.buttons)!
    expect(prompt.text).toContain(createIssueTool)
    expect(prompt.buttons!.flat().map(button => button.data)).toEqual([
      expect.stringMatching(/^tool:approve:[0-9a-f]{16}$/),
      expect.stringMatching(/^tool:decline:[0-9a-f]{16}$/)
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

  test("widget turns never get HTTP tools, even when the owner has them on", async () => {
    const origin = "https://tools-widget.test"
    const created = await app.request("/widget/admin", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ label: "w", allowedOrigins: [origin], config: { skills: [] } })
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

  test("keys are per user: another user sees none, and a copied row doesn't decrypt for them", async () => {
    const email = faker.internet.email().toLowerCase()
    const other = await signUpAndSignIn(email, faker.internet.password({ length: 8, prefix: "P4$s" }), "Other")
    const otherId = (await pool.query('SELECT id FROM "user" WHERE email = $1', [email])).rows[0].id
    expect((await mine(other)).keys).toEqual([])
    expect((await enable("tool", issues, other)).status).toBe(400)

    await pool.query(
      `INSERT INTO user_secret (user_id, name, ciphertext, iv, tag)
       SELECT $1, name, ciphertext, iv, tag FROM user_secret WHERE user_id = $2 AND name = $3`,
      [otherId, userId, `ability:${issues}`]
    )
    expect(await secretService.get(otherId, `ability:${issues}`)).toBeUndefined()
    expect(await secretService.get(userId, `ability:${issues}`)).toBe(GOOD_KEY)
  })

  test("removing the key turns off a tool that can't work without it", async () => {
    const removed = await app.request(`/abilities/me/tool/${issues}/key`, { method: "DELETE", headers: auth() })
    expect(removed.status).toBe(200)
    const listed = await mine()
    expect(listed.keys).not.toContain(issues)
    expect(listed.abilities.map((ability: { name: string }) => ability.name)).not.toContain(issues)
    expect(listed.abilities.map((ability: { name: string }) => ability.name)).toContain(weather)
  })

  test("ABILITY_KEYS gives every user a server-wide key; the user's own key still wins", async () => {
    const service = new AbilityService(pool, secretService, parseAbilityKeys(` ${issues} = server-key ,broken,=x`))
    const listed = (await service.listCatalog()).find(ability => ability.name === issues)
    expect(listed?.http?.key).toBe("optional")
    expect(await service.enable(userId, "tool", issues)).toBe("enabled")
    try {
      expect((await service.keysForUser(userId)).get(issues)).toBe("server-key")
      await secretService.set(userId, `ability:${issues}`, "own-key")
      expect((await service.keysForUser(userId)).get(issues)).toBe("own-key")
    } finally {
      await secretService.delete(userId, `ability:${issues}`)
      await service.disable(userId, "tool", issues)
    }
  })

  test("without USER_SECRET_KEY, key entry is off and tools that need a key are hidden", async () => {
    secretService.setKey(undefined)
    try {
      expect((await saveKey(extras, "x")).status).toBe(503)
      const names = ((await (await app.request("/abilities")).json()).abilities as { name: string }[]).map(p => p.name)
      expect(names).toEqual(expect.arrayContaining([weather, extras]))
      expect(names).not.toContain(issues)
      expect((await mine()).keysEnabled).toBe(false)
    } finally {
      secretService.setKey(TEST_SECRET_KEY)
    }
  })
})
