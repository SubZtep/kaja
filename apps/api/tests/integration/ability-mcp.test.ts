import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import {
  type HttpMcpFixture,
  routeHostTo,
  startHttpMcpFixture
} from "../../../../packages/nasi/tests/fixtures/mcp-http-server"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { env } from "../../src/core/env"
import { setNasiChatResolver, setNasiFetchProxyOverride } from "../../src/features/nasi/chat"
import { createPostgresAbilityStore } from "../../src/features/nasi/pg-abilities"
import { createCloudTelegramDriver } from "../../src/features/telegram/driver"
import { marketplaceService, secretService } from "../../src/services"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"
import { serveApi, startSandbox } from "./sandbox-helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const things = `things-${tag}`
const host = `mcp-${tag}.test`
const GOOD_KEY = `mcp-key-${tag}`
const TEST_SECRET_KEY = Buffer.alloc(32, 9).toString("base64")

/** A marketplace folder with one usable remote MCP ability, a stdio one for the MCP sandbox, and four the cloud must skip. */
function marketplace(base: string) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  const remote = (name: string, url: string, extra = "") =>
    `description = "The ${name} server"\ntransport = "http"\nurl = "${url}"\n${extra}`
  put(
    `abilities/${things}/mcp.toml`,
    remote(
      things,
      `https://${host}/mcp`,
      `auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer " }\napproval = "writes"\ntools = ["read_thing", "write_thing"]\n` +
        `[toolDescriptions]\nread_thing = "Reads a thing"\n`
    )
  )
  put(`abilities/open-${tag}/mcp.toml`, remote(`open-${tag}`, `https://${host}/mcp`))
  put(
    `abilities/private-${tag}/mcp.toml`,
    remote(`private-${tag}`, "http://127.0.0.1:9/mcp", `tools = ["read_thing"]\n`)
  )
  put(
    `abilities/stdio-${tag}/mcp.toml`,
    `description = "Local"\ntransport = "stdio"\ncommand = "echo"\ntools = ["x"]\n`
  )
  put(
    `abilities/counter-${tag}/mcp.toml`,
    `description = "Counts"\ntransport = "stdio"\ncommand = "unused"\ntools = ["count", "picture"]\n`
  )
  // Keys aren't forwarded to the MCP sandbox yet, so a stdio server that takes one never reaches the cloud.
  put(
    `abilities/stdio-keyed-${tag}/mcp.toml`,
    `description = "Local"\ntransport = "stdio"\ncommand = "echo"\ntools = ["x"]\nauth = { type = "apiKey", in = "env", name = "K", optional = true }\n`
  )
  // One folder, two parts: the cloud keeps the HTTP tool and drops only the MCP server it can't run (no tool list).
  put(`abilities/mixed-${tag}/mcp.toml`, remote(`mixed-${tag}`, `https://${host}/mcp`))
  put(
    `abilities/mixed-${tag}/tool.toml`,
    `description = "Mixed"\nbaseUrl = "https://api.mixed-${tag}.test"\n[[tools]]\nname = "mixed_${tag}"\ndescription = "x"\npath = "/"\n`
  )
  // Personas fix what a turn may use; the default one here uses every ability in the folder.
  const all = [
    things,
    `open-${tag}`,
    `private-${tag}`,
    `stdio-${tag}`,
    `counter-${tag}`,
    `stdio-keyed-${tag}`,
    `mixed-${tag}`
  ]
  put("personas/default.toml", `label = "Default"\nabilities = ${JSON.stringify(all)}\n`)
  return root
}

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

const call = (id: string, name: string, args: object) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) }
})

describe("MCP servers in the cloud", () => {
  let base: string
  let token: string
  let fixture: HttpMcpFixture
  const realFetch = globalThis.fetch
  const auth = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" })
  const saveKey = (apiKey: string) =>
    app.request(`/abilities/me/keys/${things}`, { method: "PUT", headers: auth(), body: JSON.stringify({ apiKey }) })
  const turn = (body: object) =>
    app.request("/nasi/turn", { method: "POST", headers: auth(), body: JSON.stringify(body) })

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "kaja-ability-mcp-test-"))
    token = await signUpAndSignIn(faker.internet.email(), faker.internet.password({ length: 8, prefix: "P4$s" }), "Mcp")
    secretService.setKey(TEST_SECRET_KEY)
    fixture = startHttpMcpFixture({ apiKey: GOOD_KEY })
    // With a proxy set the guard leaves DNS to it; the faked proxy hands the fake host to the local fixture.
    setNasiFetchProxyOverride("http://proxy.test:3128")
    globalThis.fetch = routeHostTo(fixture, host, realFetch)
  })

  afterAll(async () => {
    globalThis.fetch = realFetch
    fixture.stop()
    secretService.setKey(env.USER_SECRET_KEY)
    setNasiFetchProxyOverride(undefined)
    setNasiChatResolver(undefined)
    await pool.query("DELETE FROM ability WHERE name LIKE $1", [`%-${tag}`])
    // The fixture's default persona too, so later files get the built-in one again.
    await pool.query("DELETE FROM ability WHERE type = 'persona' AND name = 'default'")
    // The sync below marked the real marketplace's abilities removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds MCP abilities with a tool list, remote or keyless stdio; keyed stdio, private and unlisted ones are skipped, the ability's other parts kept", async () => {
    const result = await marketplaceService.syncFromDir(marketplace(base), "m1")
    expect(result.added).toContain(`abilities/${things}/mcp.toml`)
    expect(result.added).toContain(`abilities/stdio-${tag}/mcp.toml`)
    expect(result.added).toContain(`abilities/mixed-${tag}/tool.toml`)
    for (const skipped of [`open-${tag}`, `private-${tag}`, `stdio-keyed-${tag}`, `mixed-${tag}`]) {
      expect(result.added).not.toContain(`abilities/${skipped}/mcp.toml`)
    }
  })

  test("a keyless stdio server is offered, running in an MCP sandbox", async () => {
    const offered = await createPostgresAbilityStore({ userId: "any" }).listMcpAbilities()
    expect(offered.find(ability => ability.name === `stdio-${tag}`)).toMatchObject({ transport: "stdio", tools: ["x"] })
    expect(offered.map(ability => ability.name)).not.toContain(`stdio-keyed-${tag}`)
  })

  test("with no sandbox online, a stdio ability's turn still runs, without its tools", async () => {
    const sent: Parameters<typeof scriptedChat>[1] = []
    setNasiChatResolver(async () => ({
      client: scriptedChat([{ content: "Hi." }], sent) as never,
      model: "fake-model"
    }))
    expect(await (await turn({ message: "hi" })).json()).toMatchObject({ status: "completed", message: "Hi." })
    expect(sent[0]!.tools?.map(tool => tool.function.name) ?? []).not.toContain("x")
  })

  test("the keys list shows where a keyed MCP server runs and that it needs the key", async () => {
    const { abilities } = await (await app.request("/abilities/me", { headers: auth() })).json()
    expect(abilities.find((ability: { name: string }) => ability.name === things)).toMatchObject({
      key: "required",
      domain: host,
      saved: false
    })
  })

  test("a saved key is tested by connecting", async () => {
    const wrong = await (await saveKey("wrong-key")).json()
    expect(wrong.check.ok).toBe(false)
    expect(await (await saveKey(GOOD_KEY)).json()).toEqual({ check: { ok: true } })
  })

  test("a cloud turn connects the server with the user's key; a write waits for approval, then runs", async () => {
    const sent: Parameters<typeof scriptedChat>[1] = []
    const client = scriptedChat(
      [
        { content: null, tool_calls: [call("c1", "read_thing", { id: "1" })] },
        { content: null, tool_calls: [call("c2", "write_thing", { id: "2" })] },
        { content: "Done." }
      ],
      sent
    )
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    const before = fixture.initializations()

    const paused = await (await turn({ message: "read one, write two" })).json()
    expect(paused.status).toBe("needs_approval")
    expect(sent[0]!.tools!.map(t => t.function.name)).toEqual(expect.arrayContaining(["read_thing", "write_thing"]))
    expect(sent[1]!.messages.at(-1)).toMatchObject({ role: "tool", content: "thing 1" })
    expect(paused.steps).toContainEqual({
      type: "confirm_tool",
      name: "write_thing",
      arguments: '{"id":"2"}',
      summary: `ability:${things} write_thing {"id":"2"}`
    })

    const done = await (await turn({ session: paused.session, approval: "approve" })).json()
    expect(done).toMatchObject({ status: "completed", message: "Done." })
    expect(sent[2]!.messages.at(-1)).toMatchObject({ role: "tool", content: "wrote 2" })
    // One connection per turn, nothing kept between them.
    expect(fixture.initializations() - before).toBe(2)

    const { providerId } = await seedModel("ability-mcp-info")
    try {
      const info = await (await app.request("/nasi/info", { headers: auth() })).json()
      expect(info.tools).toEqual(expect.arrayContaining(["read_thing", "write_thing"]))
    } finally {
      await cleanupModel(providerId)
    }
  })

  test("removing the key takes a server that can't work without it out of turns", async () => {
    const removed = await app.request(`/abilities/me/keys/${things}`, { method: "DELETE", headers: auth() })
    expect(removed.status).toBe(200)
    const mine = await (await app.request("/abilities/me", { headers: auth() })).json()
    expect(mine.abilities.find((ability: { name: string }) => ability.name === things).saved).toBe(false)
    const sent: Parameters<typeof scriptedChat>[1] = []
    setNasiChatResolver(async () => ({
      client: scriptedChat([{ content: "Hi." }], sent) as never,
      model: "fake-model"
    }))
    await turn({ message: "hi" })
    expect(sent[0]!.tools?.map(tool => tool.function.name) ?? []).not.toContain("read_thing")
  })

  test("in the user's own sandbox, a stdio server runs for their turns and stays warm between them", async () => {
    const counter = `counter-${tag}`
    const server = serveApi()
    const { key } = await (await app.request("/sandbox/key", { method: "POST", headers: auth() })).json()
    // The sandbox starts its own copy of the server, never the command from the API's row; it dials the API with the user's key.
    const sandbox = await startSandbox({ apiUrl: `http://127.0.0.1:${server.port}`, abilities: [counter], key })
    const sandboxPool = sandbox.pool
    try {
      for (const expected of ["1", "2"]) {
        const sent: Parameters<typeof scriptedChat>[1] = []
        const client = scriptedChat(
          [{ content: null, tool_calls: [call("c1", "count", {})] }, { content: "Counted." }],
          sent
        )
        setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
        expect(await (await turn({ message: "count" })).json()).toMatchObject({
          status: "completed",
          message: "Counted."
        })
        expect(sent[1]!.messages.at(-1)).toMatchObject({ role: "tool", content: expected })
      }
      expect(sandboxPool.size).toBe(1)

      // A screenshot-like image reaches the streaming client as a data URL, not a path on the server.
      const client = scriptedChat(
        [{ content: null, tool_calls: [call("c1", "picture", {})] }, { content: "Here." }],
        []
      )
      setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
      const res = await app.request("/nasi/turn/stream", {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({ message: "show me" })
      })
      const image = (await res.text()).split("\n\n").find(block => block.startsWith("event: tool_image"))
      const data = JSON.parse(image!.slice(image!.indexOf("data:") + 5))
      expect(data).toMatchObject({ type: "tool_image", mimeType: "image/png" })
      // The screenshot went to object storage; the client gets a signed URL to it
      const fetched = await fetch(data.url)
      expect(fetched.ok).toBe(true)
      expect(Buffer.from(await fetched.arrayBuffer()).toString("base64")).toStartWith("iVBOR")

      // Telegram gets it too; Telegram can't fetch a signed URL on the local dev storage, so it goes as the bytes
      const { user } = await (await app.request("/auth/get-session", { headers: auth() })).json()
      setNasiChatResolver(async () => ({
        client: scriptedChat(
          [{ content: null, tool_calls: [call("c1", "picture", {})] }, { content: "Here." }],
          []
        ) as never,
        model: "fake-model"
      }))
      const photos: (string | Uint8Array)[] = []
      const driver = createCloudTelegramDriver({
        resolveLinkedUser: async () => ({ userId: user.id, locale: null }),
        sender: {
          async sendMessage() {
            return { messageId: 1 }
          },
          async editMessageText() {},
          async sendPhoto(_chatId, photo) {
            photos.push(photo)
          }
        }
      })
      await driver.handleMessage(1001, 55, "show me")
      expect(photos).toHaveLength(1)
      expect(photos[0]).toBeInstanceOf(Uint8Array)
      expect(Buffer.from(photos[0] as Uint8Array).toString("base64")).toStartWith("iVBOR")
    } finally {
      await sandbox.close()
      server.stop(true)
    }
  }, 60_000)
})
