import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { apiSandboxFrameSchema, SANDBOX_FULL_HEADER, sandboxFrameSchema } from "@kaja/schema/api"
import { SandboxEnvSchema } from "@kaja/schema/env"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { SandboxTunnel } from "../../api/src/features/sandbox/tunnel"
import { defaultMaxProcesses, hasRoom, SERVER_MEMORY } from "../src/capacity"
import { loadSandboxServers, type SandboxServer } from "../src/manifests"
import { type PoolOptions, ProcessPool } from "../src/pool"
import { collectStats } from "../src/stats"
import { TunnelServer } from "../src/tunnel"

// Spawning bun children is slow on a busy machine, so every test that starts one gets room.
const SPAWN_TIMEOUT_MS = 30_000
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

/** A sandbox and the API's end of its tunnel, wired in-process: every frame goes through JSON and its schema, as over the socket. */
function sandbox(
  opts: Partial<Pick<PoolOptions, "idleMs" | "maxProcesses" | "hasRoom" | "serverMemory" | "treeRss">> = {}
) {
  const pool = new ProcessPool({
    servers,
    idleMs: 60_000,
    maxProcesses: 8,
    hasRoom: async () => true,
    ...opts
  })
  pools.push(pool)
  const egress = { open: 0, allowed: 0, refused: 0, failed: 0 }
  const handler = {
    mcp: (user: string, ability: string, request: Request) => pool.handle(user, ability, request),
    release: (user: string, ability: string) => pool.release(user, ability),
    stats: () => collectStats({ pool, egress }),
    running: () => pool.size
  }
  let server: TunnelServer | undefined
  const tunnel = new SandboxTunnel({
    id: "test",
    info: {
      version: "0.0.0",
      name: null,
      arch: "x64",
      os: "linux",
      cpu: { model: "test", cores: 1 },
      memory: { total: 1, limit: null },
      maxProcesses: pool.limits.maxProcesses,
      abilities: pool.abilities
    },
    send: text => queueMicrotask(() => server?.receive(apiSandboxFrameSchema.parse(JSON.parse(text))))
  })
  server = new TunnelServer(handler, frame =>
    queueMicrotask(() => tunnel.receive(sandboxFrameSchema.parse(JSON.parse(JSON.stringify(frame)))))
  )
  return { pool, tunnel, server }
}

/** An MCP client of `ability` for `user`, over Streamable HTTP through the tunnel. */
async function connect(tunnel: SandboxTunnel, user: string, ability = "counter"): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`http://sandbox.invalid/mcp/${ability}`), {
    fetch: (url, init) => tunnel.request(user, url, init)
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

  test("a cache dir sends every server's bun/uv/npm caches there", async () => {
    const cached = await loadSandboxServers(MARKETPLACE, undefined, "/cache")
    expect(cached.get("counter")!.env).toMatchObject({
      BUN_INSTALL_CACHE_DIR: "/cache/bun",
      UV_CACHE_DIR: "/cache/uv",
      UV_PYTHON_INSTALL_DIR: "/cache/python",
      npm_config_cache: "/cache/npm"
    })
    expect(servers.get("counter")!.env).not.toHaveProperty("UV_CACHE_DIR")
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
    const { SANDBOX_EGRESS_PORT } = SandboxEnvSchema.parse({})
    expect(args).toContain(`--proxyServer=http://127.0.0.1:${SANDBOX_EGRESS_PORT}`)
    expect(args).toContain("--chromeArg=--proxy-bypass-list=<-loopback>")
    expect(args).toContain("--chromeArg=--force-webrtc-ip-handling-policy=disable_non_proxied_udp")
  })
})

describe("tunnel", () => {
  const post = (tunnel: SandboxTunnel, path: string) =>
    tunnel.request("u1", `http://sandbox.invalid${path}`, { method: "POST", body: "{}" })

  test("an ability the sandbox doesn't run is 404, and so is any path but /mcp/<ability>", async () => {
    const { tunnel } = sandbox()
    expect((await post(tunnel, "/mcp/keyed")).status).toBe(404)
    expect((await post(tunnel, "/stats")).status).toBe(404)
  })

  test("a dropped socket fails what's in flight, and nothing more is sent", async () => {
    const { tunnel } = sandbox()
    tunnel.close()
    await expect(post(tunnel, "/mcp/counter")).rejects.toThrow("the sandbox disconnected")
    await expect(tunnel.stats()).rejects.toThrow("the sandbox disconnected")
  })
})

describe("stats", () => {
  test(
    "show each running server with its user, memory and calls, and what the pool did",
    async () => {
      const { tunnel } = sandbox({ maxProcesses: 3 })
      const empty = await tunnel.stats()
      expect(empty).toMatchObject({ abilities: ["counter"], limits: { maxProcesses: 3 }, servers: [] })

      const client = await connect(tunnel, "u1")
      void client.callTool({ name: "hang", arguments: {} }).catch(() => {})
      await Bun.sleep(200)
      const busy = await tunnel.stats()
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
      const { tunnel, pool } = sandbox()
      const first = await connect(tunnel, "u1")
      expect((await first.listTools()).tools.map(tool => tool.name).sort()).toEqual([
        "count",
        "crash",
        "hang",
        "picture",
        "whoami"
      ])
      expect(await callText(first, "count")).toBe("1")
      await first.close()

      const second = await connect(tunnel, "u1")
      expect(await callText(second, "count")).toBe("2")

      const other = await connect(tunnel, "u2")
      expect(await callText(other, "count")).toBe("1")
      expect(pool.size).toBe(2)
      await Promise.all([second.close(), other.close()])
    },
    SPAWN_TIMEOUT_MS
  )

  test(
    "the server gets a throwaway HOME and none of the sandbox's own env",
    async () => {
      const before = process.env.KAJA_SANDBOX_KEY
      process.env.KAJA_SANDBOX_KEY = "ks_secret"
      try {
        const { tunnel } = sandbox()
        const client = await connect(tunnel, "u1")
        const seen = JSON.parse(await callText(client, "whoami")) as { home: string; secret: string | null }
        expect(seen.secret).toBeNull()
        expect(seen.home).toContain("kaja-sandbox-counter-")
        await client.close()
      } finally {
        if (before === undefined) delete process.env.KAJA_SANDBOX_KEY
        else process.env.KAJA_SANDBOX_KEY = before
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
        const { tunnel, pool } = sandbox()
        const client = await connect(tunnel, "u1")
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
        const { tunnel, pool } = sandbox()
        const client = await connect(tunnel, "u1")
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
      const { tunnel, pool } = sandbox({ maxProcesses: 2 })
      const first = await connect(tunnel, "u1")
      const second = await connect(tunnel, "u2")
      expect(await callText(second, "count")).toBe("1")
      expect(await callText(first, "count")).toBe("1")
      const third = await connect(tunnel, "u3")
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
      const { tunnel } = sandbox({ maxProcesses: 1 })
      const first = await connect(tunnel, "u1")
      void first.callTool({ name: "hang", arguments: {} }).catch(() => {})
      const warned = spyOn(console, "warn").mockImplementation(() => {})
      try {
        await Bun.sleep(200)
        await expect(connect(tunnel, "u2")).rejects.toThrow()
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
      const { tunnel, pool } = sandbox({ idleMs: 300 })
      const client = await connect(tunnel, "u1")
      expect(await callText(client, "count")).toBe("1")
      await client.close()
      const deadline = Date.now() + 10_000
      while (pool.size > 0 && Date.now() < deadline) await Bun.sleep(100)
      expect(pool.size).toBe(0)
      const fresh = await connect(tunnel, "u1")
      expect(await callText(fresh, "count")).toBe("1")
      await fresh.close()
    },
    SPAWN_TIMEOUT_MS
  )

  test("with too little memory left a new server isn't started, and the answer says the sandbox is full", async () => {
    const warned = spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { tunnel, pool } = sandbox({ hasRoom: async () => false })
      const response = await tunnel.request("u1", "http://sandbox.invalid/mcp/counter", { method: "POST", body: "{}" })
      expect(response.status).toBe(503)
      expect(response.headers.get(SANDBOX_FULL_HEADER)).toBe("1")
      expect(pool.counts.refusedMemory).toBe(1)
      expect(pool.size).toBe(0)
    } finally {
      warned.mockRestore()
    }
  })

  test(
    "every answer carries how many servers run, and a release stops the user's server at once",
    async () => {
      const { tunnel, pool } = sandbox()
      const client = await connect(tunnel, "u1")
      expect(await callText(client, "count")).toBe("1")
      expect(tunnel.running).toBe(1)
      await client.close()
      tunnel.release("u1", "counter")
      const deadline = Date.now() + 10_000
      while (pool.size > 0 && Date.now() < deadline) await Bun.sleep(50)
      expect(pool.size).toBe(0)
      expect(pool.counts.released).toBe(1)
      const fresh = await connect(tunnel, "u1")
      expect(await callText(fresh, "count")).toBe("1")
      await fresh.close()
    },
    SPAWN_TIMEOUT_MS
  )

  test(
    "a server over its memory is stopped, even mid-call",
    async () => {
      let rss = 100
      const { tunnel, pool } = sandbox({
        serverMemory: 1000,
        treeRss: async pids => new Map(pids.map(pid => [pid, rss]))
      })
      const client = await connect(tunnel, "u1")
      void client.callTool({ name: "hang", arguments: {} }).catch(() => {})
      await Bun.sleep(200)
      await pool.checkMemory()
      expect(pool.size).toBe(1)
      rss = 5000
      const warned = spyOn(console, "warn").mockImplementation(() => {})
      try {
        await pool.checkMemory()
      } finally {
        warned.mockRestore()
      }
      expect(pool.size).toBe(0)
      expect(pool.counts.stoppedMemory).toBe(1)
      await client.close()
    },
    SPAWN_TIMEOUT_MS
  )
})

describe("capacity", () => {
  const GB = 1024 ** 3

  test("the default cap is the container's memory limit, else the machine's, less the sandbox's share", async () => {
    expect(await defaultMaxProcesses({ container: { current: 0, max: 4 * GB }, total: 64 * GB, free: 0 })).toBe(7)
    expect(await defaultMaxProcesses({ container: { current: 0, max: null }, total: 2 * GB, free: 0 })).toBe(3)
    expect(await defaultMaxProcesses({ container: null, total: 256 * 1024 ** 2, free: 0 })).toBe(1)
  })

  test("another server fits while a server's share of memory is left", async () => {
    const container = (current: number) => ({ container: { current, max: 4 * GB }, total: 64 * GB, free: 64 * GB })
    expect(await hasRoom(container(4 * GB - SERVER_MEMORY))).toBe(true)
    expect(await hasRoom(container(4 * GB - SERVER_MEMORY + 1))).toBe(false)
    expect(await hasRoom({ container: null, total: 8 * GB, free: SERVER_MEMORY - 1 })).toBe(false)
  })
})
