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
import { marketplaceService, secretService } from "../../src/services"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const things = `things-${tag}`
const host = `mcp-${tag}.test`
const GOOD_KEY = `mcp-key-${tag}`
const TEST_SECRET_KEY = Buffer.alloc(32, 9).toString("base64")

/** A marketplace folder with one usable MCP ability and four the cloud must skip. */
function marketplace(base: string) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  const remote = (name: string, url: string, extra = "") =>
    `name = "${name}"\ndescription = "The ${name} server"\ntransport = "http"\nurl = "${url}"\n${extra}`
  put(
    `mcp/${things}.toml`,
    remote(
      things,
      `https://${host}/mcp`,
      `auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer " }\napproval = "writes"\ntools = ["read_thing", "write_thing"]\n`
    )
  )
  put(`mcp/open-${tag}.toml`, remote(`open-${tag}`, `https://${host}/mcp`))
  put(`mcp/private-${tag}.toml`, remote(`private-${tag}`, "http://127.0.0.1:9/mcp", `tools = ["read_thing"]\n`))
  put(
    `mcp/stdio-${tag}.toml`,
    `name = "stdio-${tag}"\ndescription = "Local"\ntransport = "stdio"\ncommand = "echo"\ntools = ["x"]\n`
  )
  // Same name as an HTTP tool: keys share one namespace per name, so the MCP one is skipped.
  put(`mcp/same-${tag}.toml`, remote(`same-${tag}`, `https://${host}/mcp`, `tools = ["read_thing"]\n`))
  put(
    `tools/same-${tag}.toml`,
    `name = "same-${tag}"\ndescription = "Same"\nbaseUrl = "https://api.same-${tag}.test"\n[[tools]]\nname = "same_${tag}"\ndescription = "x"\npath = "/"\n`
  )
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
    app.request(`/abilities/me/mcp/${things}/key`, { method: "PUT", headers: auth(), body: JSON.stringify({ apiKey }) })
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
    // The sync below marked the real marketplace's abilities removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds remote MCP abilities with a tool list; stdio, private, unlisted and clashing ones are skipped", async () => {
    const result = await marketplaceService.syncFromDir(marketplace(base), "m1")
    expect(result.added).toContain(`mcp/${things}`)
    expect(result.added).toContain(`tools/same-${tag}`)
    for (const skipped of [`open-${tag}`, `private-${tag}`, `stdio-${tag}`, `same-${tag}`]) {
      expect(result.added).not.toContain(`mcp/${skipped}`)
    }
  })

  test("the catalog shows where an MCP server runs, its key need, when it asks, and its tools", async () => {
    const { abilities } = await (await app.request("/abilities")).json()
    expect(abilities.find((ability: { name: string }) => ability.name === things)).toMatchObject({
      type: "mcp",
      mcp: {
        domain: host,
        key: "required",
        transport: "http",
        approval: "writes",
        tools: ["read_thing", "write_thing"]
      }
    })
  })

  test("it needs a key before it can be turned on; a saved key is tested by connecting", async () => {
    const refused = await app.request(`/abilities/me/mcp/${things}`, { method: "PUT", headers: auth() })
    expect(refused.status).toBe(400)
    const wrong = await (await saveKey("wrong-key")).json()
    expect(wrong.check.ok).toBe(false)
    expect(await (await saveKey(GOOD_KEY)).json()).toEqual({ check: { ok: true } })
    expect((await app.request(`/abilities/me/mcp/${things}`, { method: "PUT", headers: auth() })).status).toBe(200)
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

  test("removing the key turns off a server that can't work without it", async () => {
    const removed = await app.request(`/abilities/me/mcp/${things}/key`, { method: "DELETE", headers: auth() })
    expect(removed.status).toBe(200)
    const mine = await (await app.request("/abilities/me", { headers: auth() })).json()
    expect(mine.keys).not.toContain(things)
    expect(mine.abilities.map((ability: { name: string }) => ability.name)).not.toContain(things)
  })
})
