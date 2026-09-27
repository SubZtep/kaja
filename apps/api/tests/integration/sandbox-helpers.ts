import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { websocket } from "hono/bun"
import { sandboxInfo, sandboxLoad } from "../../../sandbox/src/hardware"
import { ProcessPool } from "../../../sandbox/src/pool"
import { collectStats } from "../../../sandbox/src/stats"
import { connectTunnel } from "../../../sandbox/src/tunnel"
import { app } from "../../src/app"
import { tunnelFor } from "../../src/features/sandbox"
import { sandboxService } from "../../src/services"

const COUNTER_SCRIPT = join(import.meta.dir, "../../../sandbox/tests/fixtures/counter-server.ts")

/** The API on a real port, so sandboxes can open their WebSocket to it. */
export function serveApi() {
  return Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket })
}

export type TestSandbox = {
  pool: ProcessPool
  /** Its row id once the API welcomed it. */
  id: string
  stateDir: string
  close: () => Promise<void>
}

/** A real sandbox process pool running the counter fixture as `abilities`, connected to `apiUrl` with `key` (none: anonymous). */
export async function startSandbox(opts: {
  apiUrl: string
  abilities: string[]
  key?: string
  stateDir?: string
  maxProcesses?: number
  /** Whether it has memory for another server (default yes). */
  hasRoom?: () => Promise<boolean>
}): Promise<TestSandbox> {
  const servers = new Map(
    opts.abilities.map(name => [name, { name, command: process.execPath, args: [COUNTER_SCRIPT], env: {} }])
  )
  const pool = new ProcessPool({
    servers,
    idleMs: 60_000,
    maxProcesses: opts.maxProcesses ?? 2,
    hasRoom: opts.hasRoom ?? (async () => true)
  })
  const stateDir = opts.stateDir ?? mkdtempSync(join(tmpdir(), "kaja-sandbox-state-"))
  const egress = { open: 0, allowed: 0, refused: 0, failed: 0 }
  const known = new Set((await sandboxService.list()).map(sandbox => sandbox.id))
  const tunnel = connectTunnel({
    apiUrl: opts.apiUrl,
    key: opts.key,
    stateDir,
    info: () => sandboxInfo({ name: "test", pool }),
    load: () => sandboxLoad(pool),
    handler: {
      mcp: (user, ability, request) => pool.handle(user, ability, request),
      release: (user, ability) => pool.release(user, ability),
      stats: () => collectStats({ pool, egress }),
      running: () => pool.size
    }
  })
  const id = await waitFor(async () => {
    const online = (await sandboxService.list()).filter(sandbox => sandbox.online)
    const saved = await Bun.file(join(stateDir, "instance.json"))
      .json()
      .catch(() => undefined)
    const mine = online.find(sandbox => sandbox.id === saved?.id) ?? online.find(sandbox => !known.has(sandbox.id))
    return mine && tunnelFor(mine.id) ? mine.id : undefined
  })
  return {
    pool,
    id,
    stateDir,
    close: async () => {
      tunnel.close()
      await pool.closeAll()
      await waitFor(async () => (tunnelFor(id) ? undefined : true))
      if (!opts.stateDir) rmSync(stateDir, { recursive: true, force: true })
    }
  }
}

/** Polls `check` until it returns something, for up to 10 s. */
export async function waitFor<T>(check: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = await check()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error("timed out waiting")
    await Bun.sleep(50)
  }
}
