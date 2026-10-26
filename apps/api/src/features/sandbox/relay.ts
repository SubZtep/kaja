import { type McpSandbox, SANDBOX_ORIGIN } from "@kaja/nasi"
import { SANDBOX_RELAY_KEY_HEADER } from "@kaja/schema/api"
import type { Context } from "hono"
import type { AbilityKeyValue } from "../../services/ability"
import type { RouteVariables } from "../../types"
import { sessionUser } from "../auth"
import { mcpSandboxFor } from "./registry"

/** How long a user's relay lives without a request before it closes (and releases servers on a borrowed sandbox). */
const RELAY_IDLE_MS = 15 * 60_000

// Hop-by-hop or the caller's own: never sent on to the sandbox.
const DROPPED_HEADERS = ["authorization", "cookie", "host", "connection", "content-length", SANDBOX_RELAY_KEY_HEADER]

type Relay = { sandbox: McpSandbox; keys: Map<string, AbilityKeyValue>; timer?: ReturnType<typeof setTimeout> }

const relays = new Map<string, Relay>()

/**
 * The user's relay: one {@link mcpSandboxFor} kept between requests, so a local client's MCP sessions stay on the
 * sandbox they started on. The keys it sends are whatever the client's last request for each ability carried.
 */
function relayFor(userId: string): Relay {
  let relay = relays.get(userId)
  if (!relay) {
    const keys = new Map<string, AbilityKeyValue>()
    relay = { sandbox: mcpSandboxFor(userId, ability => keys.get(ability)), keys }
    relays.set(userId, relay)
  }
  const current = relay
  clearTimeout(current.timer)
  current.timer = setTimeout(() => void closeRelay(userId, current), RELAY_IDLE_MS)
  return current
}

async function closeRelay(userId: string, relay: Relay) {
  if (relays.get(userId) !== relay) return
  relays.delete(userId)
  clearTimeout(relay.timer)
  await relay.sandbox.close?.()
}

/** Test seam: closes every relay now. */
export async function closeRelays() {
  await Promise.all([...relays].map(([userId, relay]) => closeRelay(userId, relay)))
}

/**
 * `/sandbox/relay/mcp/:ability`: a signed-in local client (the TUI's `--local`) reaches a stdio ability on a sandbox,
 * since sandboxes only dial out. Picked by the same rules as a cloud turn's (`pickSandbox`, `keyTrust`); a key in
 * `SANDBOX_RELAY_KEY_HEADER` is the user's own. When no sandbox answers, the relay starts over on the next request.
 */
export async function relayMcp(c: Context<{ Variables: RouteVariables }>) {
  const user = sessionUser(c)
  const ability = c.req.param("ability") ?? ""
  const relay = relayFor(user.id)
  const key = c.req.header(SANDBOX_RELAY_KEY_HEADER)
  if (key) relay.keys.set(ability, { value: key, own: true })
  else relay.keys.delete(ability)

  const headers = new Headers(c.req.raw.headers)
  for (const name of DROPPED_HEADERS) headers.delete(name)
  const method = c.req.method
  const body = method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer()
  const response = await relay.sandbox.fetch(`${SANDBOX_ORIGIN}/mcp/${encodeURIComponent(ability)}`, {
    method,
    headers,
    body,
    signal: c.req.raw.signal
  })
  // The sandbox it picked is gone: the next request picks again.
  if (response.status === 503) await closeRelay(user.id, relay)
  return response
}
