import { createHmac } from "node:crypto"
import type { McpSandbox } from "@kaja/nasi"
import type { Sandbox } from "@kaja/schema/api"
import { env } from "../../core/env"
import { lookupGeo } from "../../core/geo"
import { sandboxService } from "../../services"
import type { SandboxTunnel } from "./tunnel"

/** Connected sandboxes by id. Their rows say `online`, but only this process holds their sockets (one API instance). */
const tunnels = new Map<string, SandboxTunnel>()
/** Which user each pseudonym a sandbox saw stands for, so the admin dashboard can name them. */
const pseudonyms = new Map<string, string>()
/** The sandbox a user's turns last ran in: their servers (a browser's pages) are warm there, so it's kept while usable. */
const lastPick = new Map<string, string>()
/** Where users are, from the IP of their latest turn, for picking a shared sandbox near them. */
const places = new Map<string, { latitude: number; longitude: number; at: number }>()
const PLACE_TTL_MS = 24 * 60 * 60 * 1000

export function addTunnel(tunnel: SandboxTunnel) {
  tunnels.get(tunnel.id)?.close()
  tunnels.set(tunnel.id, tunnel)
}

/** Forgets the tunnel if it's still the registered one (a reconnect may have replaced it). */
export function removeTunnel(tunnel: SandboxTunnel) {
  if (tunnels.get(tunnel.id) === tunnel) tunnels.delete(tunnel.id)
  tunnel.close()
}

export function tunnelFor(id: string): SandboxTunnel | undefined {
  return tunnels.get(id)
}

/** The user a sandbox's pseudonym stands for, when this process handed it out. */
export function userForPseudonym(pseudonym: string): string | undefined {
  return pseudonyms.get(pseudonym)
}

/** What a sandbox calls `userId`: stable for that pair, and meaningless to its operator or to any other sandbox. */
export function pseudonymFor(userId: string, sandboxId: string): string {
  const pseudonym = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`sandbox:${sandboxId}:${userId}`)
    .digest("base64url")
    .slice(0, 22)
  pseudonyms.set(pseudonym, userId)
  return pseudonym
}

/** Remembers roughly where the user is (their turn's IP), at most once a day, for {@link pickSandbox}. */
export function rememberPlace(userId: string, ip: string | undefined) {
  const known = places.get(userId)
  if (known && Date.now() - known.at < PLACE_TTL_MS) return
  void lookupGeo(ip).then(geo => {
    if (geo?.latitude != null && geo.longitude != null)
      places.set(userId, { latitude: geo.latitude, longitude: geo.longitude, at: Date.now() })
  })
}

// Kilometres between two points on the globe (haversine).
function distance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 12_742 * Math.asin(Math.sqrt(h))
}

// How full a sandbox is: running servers over its cap (1 when it takes none).
function fullness(sandbox: Sandbox, tunnel: SandboxTunnel): number {
  const max = tunnel.info.maxProcesses
  return max > 0 ? (tunnel.load?.running ?? sandbox.load?.running ?? 0) / max : 1
}

/**
 * The sandbox a user's turn runs its stdio abilities in: the last one while it's still usable, else their own (the
 * least full), else, when they allow it, one another user shares (the nearest, then the least full), else the official box.
 */
export async function pickSandbox(userId: string, ability: string): Promise<SandboxTunnel | undefined> {
  const { useShared } = await sandboxService.settings(userId)
  const usable = (await sandboxService.usableBy(userId, useShared)).flatMap(sandbox => {
    const tunnel = tunnels.get(sandbox.id)
    return tunnel && !tunnel.closed && tunnel.info.abilities.includes(ability) ? [{ sandbox, tunnel }] : []
  })
  const last = usable.find(entry => entry.sandbox.id === lastPick.get(userId))
  if (last && fullness(last.sandbox, last.tunnel) < 1) return last.tunnel

  const place = places.get(userId)
  const byFullness = (a: (typeof usable)[number], b: (typeof usable)[number]) =>
    fullness(a.sandbox, a.tunnel) - fullness(b.sandbox, b.tunnel)
  const own = usable.filter(entry => entry.sandbox.ownerId === userId).sort(byFullness)
  const shared = usable
    .filter(entry => entry.sandbox.ownerId !== userId && entry.sandbox.kind !== "official")
    .sort((a, b) => {
      const far = (entry: (typeof usable)[number]) =>
        place && entry.sandbox.latitude != null && entry.sandbox.longitude != null
          ? distance(place, { latitude: entry.sandbox.latitude, longitude: entry.sandbox.longitude })
          : Number.POSITIVE_INFINITY
      // Within about 500 km counts as equally near, so load decides between neighbours.
      const byPlace = Math.round(far(a) / 500) - Math.round(far(b) / 500)
      return Number.isNaN(byPlace) || byPlace === 0 ? byFullness(a, b) : byPlace
    })
  const official = usable.filter(entry => entry.sandbox.kind === "official").sort(byFullness)
  const ordered = [...own, ...shared, ...official]
  const picked = ordered.find(entry => fullness(entry.sandbox, entry.tunnel) < 1) ?? ordered[0]
  if (picked) lastPick.set(userId, picked.sandbox.id)
  return picked?.tunnel
}

/** A turn's MCP sandbox: an ability's first request picks a sandbox for the user, and the turn's later ones go there too. */
export function mcpSandboxFor(userId: string): McpSandbox {
  const picked = new Map<string, Promise<SandboxTunnel | undefined>>()
  return {
    fetch: async (input, init) => {
      const ability = decodeURIComponent(/^\/mcp\/([^/]+)$/.exec(new URL(String(input)).pathname)?.[1] ?? "")
      if (!picked.has(ability)) picked.set(ability, pickSandbox(userId, ability))
      const tunnel = await picked.get(ability)
      if (!tunnel || tunnel.closed) {
        return Response.json({ error: "no MCP sandbox is online for you right now" }, { status: 503 })
      }
      return tunnel.request(pseudonymFor(userId, tunnel.id), input, init)
    }
  }
}
