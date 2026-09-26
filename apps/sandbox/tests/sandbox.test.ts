import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { signSandboxToken } from "@kaja/shared"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { createApp } from "../src/app"
import { loadSandboxServers, type SandboxServer } from "../src/manifests"
import { ProcessPool } from "../src/pool"

// Spawning bun children is slow on a busy machine, so every test that starts one gets room.
const SPAWN_TIMEOUT_MS = 30_000
const SECRET = "sandbox-test-secret"
const MARKETPLACE = join(import.meta.dir, "fixtures/marketplace")

let dir: string
let servers: Map<string, SandboxServer>
const pools: ProcessPool[] = []

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "kaja-sandbox-test-"))
  const overrides = join(dir, "overrides.json")
  const counter = { command: process.execPath, args: [join(import.meta.dir, "fixtures/counter-server.ts")] }
  await writeFile(overrides, JSON.stringify({ counter }))
  servers = await loadSandboxServers(MARKETPLACE, overrides)
})

afterEach(async () => {
  await Promise.all(pools.splice(0).map(pool => pool.closeAll()))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function sandbox(opts: { idleMs?: number; maxProcesses?: number } = {}) {
  const pool = new ProcessPool({ servers, idleMs: opts.idleMs ?? 60_000, maxProcesses: opts.maxProcesses ?? 8 })
  pools.push(pool)
  return { pool, app: createApp({ secret: SECRET, pool }) }
}

async function token(sub: string, ability: string, secret = SECRET) {
  return signSandboxToken({ sub, ability, exp: Math.floor(Date.now() / 1000) + 60 }, secret)
}

/** An MCP client of `ability` for `user`, over Streamable HTTP straight into the app. */
async function connect(app: ReturnType<typeof createApp>, user: string, ability = "counter"): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`http://sandbox.test/mcp/${ability}`), {
    requestInit: { headers: { Authorization: `Bearer ${await token(user, ability)}` } },
    fetch: async (url, init) => app.fetch(new Request(url, init))
  })
  const client = new Client({ name: "test", version: "1.0.0" })
  await client.connect(transport)
  return client
}

async function callText(client: Client, name: string): Promise<string> {
  const result = await client.callTool({ name, arguments: {} })
  return (result.content as { type: string; text: string }[])[0]!.text
}

describe("manifests", () => {
  test("only keyless stdio servers load, with this host's overrides", () => {
    expect([...servers.keys()]).toEqual(["counter"])
    expect(servers.get("counter")!.command).toBe(process.execPath)
  })

  test("the image's Chrome only opens http(s) pages, never file://", async () => {
    const shipped = await loadSandboxServers(
      join(import.meta.dir, "../../../marketplace"),
      join(import.meta.dir, "../overrides.json")
    )
    const args = shipped.get("chrome-devtools")!.args
    expect(args.filter(arg => arg.startsWith("--allowedUrlPattern="))).toEqual([
      "--allowedUrlPattern=http://*",
      "--allowedUrlPattern=https://*"
    ])
  })
})

describe("auth", () => {
  const post = (app: ReturnType<typeof createApp>, path: string, auth?: string) =>
    app.request(path, { method: "POST", headers: auth ? { Authorization: auth } : {}, body: "{}" })

  test("no token, a forged one, or one for another ability is refused", async () => {
    const { app } = sandbox()
    expect((await post(app, "/mcp/counter")).status).toBe(401)
    expect((await post(app, "/mcp/counter", `Bearer ${await token("u1", "counter", "wrong")}`)).status).toBe(401)
    expect((await post(app, "/mcp/counter", `Bearer ${await token("u1", "other")}`)).status).toBe(401)
  })

  test("an ability the sandbox doesn't run is 404, even with a valid token", async () => {
    const { app } = sandbox()
    expect((await post(app, "/mcp/keyed", `Bearer ${await token("u1", "keyed")}`)).status).toBe(404)
  })
})

describe("relay", () => {
  test(
    "a new session reaches the same warm server, and another user gets their own",
    async () => {
      const { app, pool } = sandbox()
      const first = await connect(app, "u1")
      expect((await first.listTools()).tools.map(tool => tool.name).sort()).toEqual(["count", "picture", "whoami"])
      expect(await callText(first, "count")).toBe("1")
      await first.close()

      const second = await connect(app, "u1")
      expect(await callText(second, "count")).toBe("2")

      const other = await connect(app, "u2")
      expect(await callText(other, "count")).toBe("1")
      expect(pool.size).toBe(2)
      await Promise.all([second.close(), other.close()])
    },
    SPAWN_TIMEOUT_MS
  )

  test(
    "the server gets a throwaway HOME and none of the sandbox's own env",
    async () => {
      const before = process.env.SANDBOX_SECRET
      process.env.SANDBOX_SECRET = SECRET
      try {
        const { app } = sandbox()
        const client = await connect(app, "u1")
        const seen = JSON.parse(await callText(client, "whoami")) as { home: string; secret: string | null }
        expect(seen.secret).toBeNull()
        expect(seen.home).toContain("kaja-sandbox-counter-")
        await client.close()
      } finally {
        if (before === undefined) delete process.env.SANDBOX_SECRET
        else process.env.SANDBOX_SECRET = before
      }
    },
    SPAWN_TIMEOUT_MS
  )
})

describe("pool", () => {
  test(
    "past the process limit a new user is turned away until one stops",
    async () => {
      const { app, pool } = sandbox({ maxProcesses: 1 })
      const first = await connect(app, "u1")
      await expect(connect(app, "u2")).rejects.toThrow()
      await first.close()
      await pool.closeAll()
      const next = await connect(app, "u2")
      expect(await callText(next, "count")).toBe("1")
      await next.close()
    },
    SPAWN_TIMEOUT_MS
  )

  test(
    "an idle server is stopped, and the next session starts a fresh one",
    async () => {
      const { app, pool } = sandbox({ idleMs: 300 })
      const client = await connect(app, "u1")
      expect(await callText(client, "count")).toBe("1")
      await client.close()
      const deadline = Date.now() + 10_000
      while (pool.size > 0 && Date.now() < deadline) await Bun.sleep(100)
      expect(pool.size).toBe(0)
      const fresh = await connect(app, "u1")
      expect(await callText(fresh, "count")).toBe("1")
      await fresh.close()
    },
    SPAWN_TIMEOUT_MS
  )
})
