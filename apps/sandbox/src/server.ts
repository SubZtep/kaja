import { printBanner } from "./banner"
import { defaultMaxProcesses } from "./capacity"
import { type EgressCounts, startEgressProxy } from "./egress"
import { env } from "./env"
import { sandboxInfo, sandboxLoad } from "./hardware"
import { markHealth } from "./health"
import { UserIsolation } from "./isolation"
import { loadSandboxServers } from "./manifests"
import { ProcessPool } from "./pool"
import { initReporting } from "./report"
import { collectStats } from "./stats"
import { connectTunnel } from "./tunnel"

/** Starts the sandbox: its egress proxy and process pool, then the tunnel to the API (the bundle's entry, cli.ts, calls it unless asked for `health`). */
export async function startSandbox(): Promise<void> {
  initReporting(env)

  const egressCounts: EgressCounts = { open: 0, allowed: 0, refused: 0, failed: 0 }
  const egress = await startEgressProxy({
    port: env.SANDBOX_EGRESS_PORT,
    counts: egressCounts,
    upstream: env.WEB_PROXY
  })
  const servers = await loadSandboxServers(env.MARKETPLACE_DIR, env.SANDBOX_OVERRIDES, env.SANDBOX_CACHE_DIR)
  const isolation = await UserIsolation.create({ enabled: env.SANDBOX_ISOLATE_USERS, cacheDir: env.SANDBOX_CACHE_DIR })
  const maxProcesses = env.SANDBOX_MAX_PROCESSES ?? (await defaultMaxProcesses())
  const pool = new ProcessPool({
    servers,
    idleMs: env.SANDBOX_IDLE_MS,
    maxProcesses,
    serverMemory: env.SANDBOX_SERVER_MEMORY,
    isolation
  })
  printBanner({
    API: env.KAJA_API_URL,
    Owner: env.KAJA_SANDBOX_KEY ? "linked to your account (sandbox key)" : "anonymous, shared with everyone",
    Name: env.SANDBOX_NAME ?? "(unnamed)",
    Servers: [...servers.keys()].join(", ") || "none",
    Capacity: `up to ${maxProcesses} MCP server(s) at once`,
    Users: isolation ? "each as their own Linux user" : "not isolated"
  })
  markHealth(false)

  const STATUS_EVERY_MS = 15 * 60_000
  let connectedAs: string | undefined

  // Nothing connects in: the sandbox dials the API and serves its requests over that socket.
  const tunnel = connectTunnel({
    apiUrl: env.KAJA_API_URL,
    key: env.KAJA_SANDBOX_KEY,
    stateDir: env.SANDBOX_STATE_DIR,
    info: () => sandboxInfo({ name: env.SANDBOX_NAME, pool }),
    load: () => sandboxLoad(pool),
    onStatus: status => {
      markHealth(status.connected)
      const id = status.connected ? status.id : undefined
      // Once per connection, not per heartbeat
      if (id && id !== connectedAs) console.log("Sandbox ready: waiting for cloud turns to use it")
      connectedAs = id
    },
    handler: {
      mcp: (user, ability, request) => pool.handle(user, ability, request),
      release: (user, ability) => pool.release(user, ability),
      running: () => pool.size,
      stats: () => collectStats({ pool, egress: egressCounts })
    }
  })

  // A line now and then, so the logs show it's alive even while nobody uses it
  setInterval(() => {
    console.log(
      `Sandbox ${connectedAs ? `connected as ${connectedAs}` : "reconnecting to the API"}, ${pool.size} MCP server(s) running`
    )
  }, STATUS_EVERY_MS)

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      markHealth(false)
      tunnel.close()
      egress.close()
      void pool.closeAll().finally(() => process.exit(0))
    })
  }
}
