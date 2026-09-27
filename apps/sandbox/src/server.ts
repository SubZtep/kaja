import { defaultMaxProcesses } from "./capacity"
import { type EgressCounts, startEgressProxy } from "./egress"
import { env } from "./env"
import { sandboxInfo, sandboxLoad } from "./hardware"
import { UserIsolation } from "./isolation"
import { loadSandboxServers } from "./manifests"
import { ProcessPool } from "./pool"
import { initReporting } from "./report"
import { collectStats } from "./stats"
import { connectTunnel } from "./tunnel"

initReporting(env)

const egressCounts: EgressCounts = { open: 0, allowed: 0, refused: 0, failed: 0 }
const egress = await startEgressProxy({
  port: env.SANDBOX_EGRESS_PORT,
  counts: egressCounts,
  upstream: env.WEB_PROXY
})
const servers = await loadSandboxServers(env.MARKETPLACE_DIR, env.SANDBOX_OVERRIDES, env.SANDBOX_CACHE_DIR)
const isolation = await UserIsolation.create({ enabled: env.SANDBOX_ISOLATE_USERS, cacheDir: env.SANDBOX_CACHE_DIR })
const pool = new ProcessPool({
  servers,
  idleMs: env.SANDBOX_IDLE_MS,
  maxProcesses: env.SANDBOX_MAX_PROCESSES ?? (await defaultMaxProcesses()),
  serverMemory: env.SANDBOX_SERVER_MEMORY,
  isolation
})
console.log(
  `MCP sandbox running ${[...servers.keys()].join(", ") || "nothing"}${isolation ? ", each user as their own Linux user" : ""}`
)

// Nothing connects in: the sandbox dials the API and serves its requests over that socket.
const tunnel = connectTunnel({
  apiUrl: env.KAJA_API_URL,
  key: env.KAJA_SANDBOX_KEY,
  stateDir: env.SANDBOX_STATE_DIR,
  info: () => sandboxInfo({ name: env.SANDBOX_NAME, pool }),
  load: () => sandboxLoad(pool),
  handler: {
    mcp: (user, ability, request) => pool.handle(user, ability, request),
    release: (user, ability) => pool.release(user, ability),
    running: () => pool.size,
    stats: () => collectStats({ pool, egress: egressCounts })
  }
})

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    tunnel.close()
    egress.close()
    void pool.closeAll().finally(() => process.exit(0))
  })
}
