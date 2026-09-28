import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Inside the container only (not the /data volume), so a stale file never outlives the process that wrote it. */
const HEALTH_FILE = join(tmpdir(), "kaja-sandbox-health.json")

/** How old the last welcome or heartbeat may be (heartbeats go every minute) before the sandbox counts as unhealthy. */
const FRESH_MS = 150_000

type Health = { connected: boolean; at: number }

/** Records whether the sandbox is connected to the API right now; called on welcome, every heartbeat and every disconnect. */
export function markHealth(connected: boolean): void {
  try {
    writeFileSync(HEALTH_FILE, JSON.stringify({ connected, at: Date.now() } satisfies Health))
  } catch {
    // A read-only tmp only costs the healthcheck, never the sandbox itself
  }
}

/** `bun sandbox.js health`, the Docker HEALTHCHECK: exit 0 when connected with a recent heartbeat, 1 otherwise (and why). */
export function runHealthCheck(): never {
  try {
    const health = JSON.parse(readFileSync(HEALTH_FILE, "utf8")) as Health
    const age = Date.now() - health.at
    if (health.connected && age < FRESH_MS) {
      console.log(`connected, last heartbeat ${Math.round(age / 1000)}s ago`)
      process.exit(0)
    }
    console.log(health.connected ? `no heartbeat for ${Math.round(age / 1000)}s` : "not connected to the API")
  } catch {
    console.log("not connected yet")
  }
  process.exit(1)
}
