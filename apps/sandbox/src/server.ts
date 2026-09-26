import { createApp } from "./app"
import { startEgressProxy } from "./egress"
import { env } from "./env"
import { loadSandboxServers } from "./manifests"
import { ProcessPool } from "./pool"
import { initReporting } from "./report"

initReporting(env)

const egress = await startEgressProxy({ port: env.SANDBOX_EGRESS_PORT })
const servers = await loadSandboxServers(env.MARKETPLACE_DIR, env.SANDBOX_OVERRIDES)
const pool = new ProcessPool({ servers, idleMs: env.SANDBOX_IDLE_MS, maxProcesses: env.SANDBOX_MAX_PROCESSES })
const app = createApp({ secret: env.SANDBOX_SECRET, pool })

const server = Bun.serve({ port: env.PORT, fetch: app.fetch, idleTimeout: 0 })
console.log(`MCP sandbox on :${server.port}, running ${[...servers.keys()].join(", ") || "nothing"}`)

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    egress.close()
    void pool.closeAll().finally(() => process.exit(0))
  })
}
