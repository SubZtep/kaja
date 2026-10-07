import { createHmac, hkdfSync } from "node:crypto"
import type { McpSandbox } from "@kaja/nasi"
import { SANDBOX_FULL_HEADER, type Sandbox } from "@kaja/schema/api"
import { env } from "../../core/env"
import { lookupGeo } from "../../core/geo"
import { reportError } from "../../core/report"
import { abilityService, sandboxService } from "../../services"
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

// Its own key derived from the auth secret, so pseudonyms never use the key that signs sessions
const pseudonymKey = Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", "kaja sandbox pseudonym", 32))

/** What a sandbox calls `userId`: stable for that pair, and meaningless to its operator or to any other sandbox. */
export function pseudonymFor(userId: string, sandboxId: string): string {
  const pseudonym = createHmac("sha256", pseudonymKey)
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
  return max > 0 ? (tunnel.running ?? sandbox.load?.running ?? 0) / max : 1
}

/** Where {@link pickSandbox} put a user's ability, and whose box that is. */
export type SandboxPick = { tunnel: SandboxTunnel; borrowed: boolean }

/**
 * The sandbox a user's turn runs its stdio abilities in: the last one while it's still usable, else their own (the
 * least full), else, when they allow it and the ability doesn't need a trusted box, one another user shares (the
 * nearest, then the least full), else the official box. `skip` leaves out sandboxes that just answered they're full.
 */
export async function pickSandbox(
  userId: string,
  ability: string,
  opts: { trusted?: boolean; skip?: Set<string> } = {}
): Promise<SandboxPick | undefined> {
  const { useShared } = await sandboxService.settings(userId)
  const usable = (await sandboxService.usableBy(userId, useShared && !opts.trusted)).flatMap(sandbox => {
    const tunnel = tunnels.get(sandbox.id)
    return tunnel && !tunnel.closed && !opts.skip?.has(sandbox.id) && tunnel.info.abilities.includes(ability)
      ? [{ sandbox, tunnel }]
      : []
  })
  const pick = (entry: (typeof usable)[number]): SandboxPick => ({
    tunnel: entry.tunnel,
    borrowed: entry.sandbox.ownerId !== userId && entry.sandbox.kind !== "official"
  })
  const last = usable.find(entry => entry.sandbox.id === lastPick.get(userId))
  if (last && fullness(last.sandbox, last.tunnel) < 1) return pick(last)

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
  return picked && pick(picked)
}

/** How many other sandboxes a request that found its sandbox full tries. */
const FULL_RETRIES = 3

/**
 * A turn's MCP sandbox: an ability's first request picks a sandbox for the user (another one when that answers it's
 * full), and the turn's later ones go there too. Closing it releases the user's servers on sandboxes they borrowed,
 * so nothing of the turn (a browser's logins) stays on someone else's machine.
 */
export function mcpSandboxFor(userId: string): McpSandbox {
  const picked = new Map<string, Promise<SandboxPick | undefined>>()
  let trusted: Promise<Set<string> | undefined> | undefined
  // The abilities that must stay on the user's own or the official sandbox (the manifest's trustedSandbox). If that
  // can't be looked up, every ability is treated as trusted-only: a browser's logins must never land on a stranger's machine.
  const needsTrust = async (ability: string) => {
    trusted ??= abilityService
      .mcpAbilities()
      .then(abilities => new Set(abilities.filter(a => a.trustedSandbox).map(a => a.name)))
      .catch(error => {
        reportError("trusted sandbox abilities lookup failed", error, { userId })
        return undefined
      })
    const names = await trusted
    return names === undefined || names.has(ability)
  }

  return {
    fetch: async (input, init) => {
      const ability = decodeURIComponent(/^\/mcp\/([^/]+)$/.exec(new URL(String(input)).pathname)?.[1] ?? "")
      if (!picked.has(ability)) {
        picked.set(
          ability,
          needsTrust(ability).then(trust => pickSandbox(userId, ability, { trusted: trust }))
        )
      }
      // A retry resends the body, so it's read once up front.
      const body =
        init?.body === undefined || init.body === null ? undefined : await new Response(init.body).arrayBuffer()
      const skip = new Set<string>()
      for (let attempt = 0; ; attempt++) {
        const current = await picked.get(ability)
        if (!current || current.tunnel.closed) {
          return Response.json({ error: "no MCP sandbox is online for you right now" }, { status: 503 })
        }
        const { tunnel } = current
        const response = await tunnel.request(pseudonymFor(userId, tunnel.id), input, { ...init, body })
        if (response.status !== 503 || !response.headers.has(SANDBOX_FULL_HEADER) || attempt >= FULL_RETRIES) {
          return response
        }
        await response.body?.cancel()
        skip.add(tunnel.id)
        const trust = await needsTrust(ability)
        picked.set(ability, pickSandbox(userId, ability, { trusted: trust, skip }))
      }
    },
    close: async () => {
      for (const [ability, pending] of picked) {
        const current = await pending.catch(() => undefined)
        if (current?.borrowed) current.tunnel.release(pseudonymFor(userId, current.tunnel.id), ability)
      }
    }
  }
}
