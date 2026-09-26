import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sandboxStatsSchema } from "@kaja/schema/api"
import { SandboxEnvSchema } from "@kaja/schema/env"
import { SANDBOX_STATS_SCOPE, signSandboxToken } from "@kaja/shared"
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

  test("the image's Chrome goes out only through the egress proxy, loopback included", async () => {
    const shipped = await loadSandboxServers(
      join(import.meta.dir, "../../../marketplace"),
      join(import.meta.dir, "../overrides.json")
    )
    const args = shipped.get("chrome-devtools")!.args
    const { SANDBOX_EGRESS_PORT } = SandboxEnvSchema.parse({ SANDBOX_SECRET: SECRET })
    expect(args).toContain(`--proxyServer=http://127.0.0.1:${SANDBOX_EGRESS_PORT}`)
    expect(args).toContain("--chromeArg=--proxy-bypass-list=<-loopback>")
    expect(args).toContain("--chromeArg=--force-webrtc-ip-handling-policy=disable_non_proxied_udp")
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

describe("stats", () => {
  const stats = async (app: ReturnType<typeof createApp>, ability = SANDBOX_STATS_SCOPE) =>
    app.request("/stats", { headers: { Authorization: `Bearer ${await token("admin", ability)}` } })

  test("only the stats token opens them: none or an ability's is refused, and it opens no MCP server", async () => {
    const { app } = sandbox()
    expect((await app.request("/stats")).status).toBe(401)
    expect((await stats(app, "counter")).status).toBe(401)
    const mcp = await app.request(`/mcp/${encodeURIComponent(SANDBOX_STATS_SCOPE)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token("admin", SANDBOX_STATS_SCOPE)}` },
      body: "{}"
    })
    expect(mcp.status).toBe(404)
  })

  test(
    "show each running server with its user, memory and calls, and what the pool did",
    async () => {
      const { app } = sandbox({ maxProcesses: 3 })
      const empty = sandboxStatsSchema.parse(await (await stats(app)).json())
      expect(empty).toMatchObject({ abilities: ["counter"], limits: { maxProcesses: 3 }, servers: [] })

      const client = await connect(app, "u1")
      void client.callTool({ name: "hang", arguments: {} }).catch(() => {})
      await Bun.sleep(200)
      const busy = sandboxStatsSchema.parse(await (await stats(app)).json())
      expect(busy.servers).toEqual([
        expect.objectContaining({ user: "u1", ability: "counter", state: "running", pending: 1, sessions: 1 })
      ])
      expect(busy.servers[0]!.pid).toBeGreaterThan(0)
      if (process.platform === "linux") expect(busy.servers[0]!.rss).toBeGreaterThan(0)
      expect(busy.pool).toMatchObject({ started: 1, failedToStart: 0, crashed: 0 })
      await client.close()
    },
    SPAWN_TIMEOUT_MS
  )
})

describe("relay", () => {
  test(
    "a new session reaches the same warm server, and another user gets their own",
    async () => {
      const { app, pool } = sandbox()
      const first = await connect(app, "u1")
      expect((await first.listTools()).tools.map(tool => tool.name).sort()).toEqual([
        "count",
        "crash",
        "hang",
        "picture",
        "whoami"
      ])
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

describe("reporting", () => {
  test(
    "a server that dies on its own is reported with its last stderr lines, and forgotten",
    async () => {
      const logged = spyOn(console, "error").mockImplementation(() => {})
      try {
        const { app, pool } = sandbox()
        const client = await connect(app, "u1")
        void client.callTool({ name: "crash", arguments: {} }).catch(() => {})
        const deadline = Date.now() + 10_000
        while (pool.size > 0 && Date.now() < deadline) await Bun.sleep(100)
        expect(pool.size).toBe(0)
        const report = logged.mock.calls.find(([message]) => message === "Sandbox MCP server exited")
        expect(report?.[1]).toMatchObject({ server: "counter", stderr: "counter: out of cheese" })
        await client.close()
      } finally {
        logged.mockRestore()
      }
    },
    SPAWN_TIMEOUT_MS
  )

  test(
    "a server the sandbox stops itself isn't reported",
    async () => {
      const logged = spyOn(console, "error").mockImplementation(() => {})
      try {
        const { app, pool } = sandbox()
        const client = await connect(app, "u1")
        await client.close()
        await pool.closeAll()
        expect(logged.mock.calls.some(([message]) => message === "Sandbox MCP server exited")).toBe(false)
      } finally {
        logged.mockRestore()
      }
    },
    SPAWN_TIMEOUT_MS
  )
})

describe("pool", () => {
  test(
    "past the process limit the least recently used idle server makes room",
    async () => {
      const { app, pool } = sandbox({ maxProcesses: 2 })
      const first = await connect(app, "u1")
      const second = await connect(app, "u2")
      expect(await callText(second, "count")).toBe("1")
      expect(await callText(first, "count")).toBe("1")
      const third = await connect(app, "u3")
      expect(await callText(third, "count")).toBe("1")
      expect(pool.size).toBe(2)
      expect(await callText(first, "count")).toBe("2")
      await Promise.all([first.close(), second.close(), third.close()])
    },
    SPAWN_TIMEOUT_MS
  )

  test(
    "when every server is mid-call a new user is turned away",
    async () => {
      const { app } = sandbox({ maxProcesses: 1 })
      const first = await connect(app, "u1")
      void first.callTool({ name: "hang", arguments: {} }).catch(() => {})
      const warned = spyOn(console, "warn").mockImplementation(() => {})
      try {
        await Bun.sleep(200)
        await expect(connect(app, "u2")).rejects.toThrow()
        expect(warned.mock.calls.some(([message]) => message === "Sandbox is full")).toBe(true)
      } finally {
        warned.mockRestore()
      }
      await first.close()
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
