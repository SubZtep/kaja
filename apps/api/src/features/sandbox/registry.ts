import { createHmac, hkdfSync } from "node:crypto"
import type { FetchLike, McpSandbox } from "@kaja/nasi"
import { SANDBOX_FULL_HEADER, type Sandbox } from "@kaja/schema/api"
import { env } from "../../core/env"
import { lookupGeo } from "../../core/geo"
import { reportError } from "../../core/report"
import { abilityService, sandboxService } from "../../services"
import type { AbilityKeyValue } from "../../services/ability"
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
 * Which sandboxes may take a call: `any` (a keyless one: the user's own, shared ones when they allow it, the official
 * box), `trusted` (the user's own or the official box), `official` (only the official box).
 */
export type SandboxTrust = "any" | "trusted" | "official"

/**
 * The sandbox a user's turn runs a stdio ability in (`ability`), or sends a tool request out through (`ability`
 * null): the last one while it's still usable, else their own (the least full), else, when they allow it and `trust`
 * is `any`, one another user shares (the nearest, then the least full), else the official box. `skip` leaves out
 * sandboxes that just answered they're full.
 */
export async function pickSandbox(
  userId: string,
  ability: string | null,
  opts: { trust?: SandboxTrust; skip?: Set<string> } = {}
): Promise<SandboxPick | undefined> {
  const trust = opts.trust ?? "any"
  const { useShared } = await sandboxService.settings(userId)
  const usable = (await sandboxService.usableBy(userId, useShared && trust === "any")).flatMap(sandbox => {
    const tunnel = tunnels.get(sandbox.id)
    const serves = ability === null ? tunnel?.info.fetch === true : tunnel?.info.abilities.includes(ability)
    return tunnel &&
      !tunnel.closed &&
      !opts.skip?.has(sandbox.id) &&
      serves &&
      (trust !== "official" || sandbox.kind === "official")
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
  // A request sent out leaves nothing warm behind, so it doesn't move where the user's servers go next
  if (picked && ability !== null) lastPick.set(userId, picked.sandbox.id)
  return picked && pick(picked)
}

/** How many other sandboxes a request that found its sandbox full tries. */
const FULL_RETRIES = 3

/** The key a user's turn would send an ability's calls with (theirs, else a server-wide one), if any. */
export type SandboxKeys = (ability: string) => AbilityKeyValue | undefined

const TRUST_ORDER: SandboxTrust[] = ["any", "trusted", "official"]

/** Where a call carrying `key` may go: anywhere without one, the user's own or the official sandbox with their own, only the official one with a server-wide key (an operator could log it). */
export function keyTrust(key: AbilityKeyValue | undefined): SandboxTrust {
  if (!key) return "any"
  return key.own ? "trusted" : "official"
}

function strictest(a: SandboxTrust, b: SandboxTrust): SandboxTrust {
  return TRUST_ORDER[Math.max(TRUST_ORDER.indexOf(a), TRUST_ORDER.indexOf(b))]!
}

/**
 * Whether an ability must stay on the user's own or the official sandbox (the manifest's trustedSandbox), looked up
 * once. If that can't be looked up, every ability is treated as trusted-only: a browser's logins must never land on
 * a stranger's machine.
 */
function trustedAbilities(userId: string): (ability: string) => Promise<boolean> {
  let trusted: Promise<Set<string> | undefined> | undefined
  return async ability => {
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
}

/**
 * A turn's MCP sandbox: an ability's first request picks a sandbox for the user (another one when that answers it's
 * full), and the turn's later ones go there too. A keyed server gets its key with every request, so it only runs where
 * that key may go ({@link keyTrust}). Closing it releases the user's servers on sandboxes they borrowed, so nothing
 * of the turn (a browser's logins) stays on someone else's machine.
 */
export function mcpSandboxFor(userId: string, keys: SandboxKeys = () => undefined): McpSandbox {
  const picked = new Map<string, Promise<SandboxPick | undefined>>()
  const needsTrust = trustedAbilities(userId)
  const trustOf = async (ability: string) =>
    strictest((await needsTrust(ability)) ? "trusted" : "any", keyTrust(keys(ability)))

  return {
    fetch: async (input, init) => {
      const ability = decodeURIComponent(/^\/mcp\/([^/]+)$/.exec(new URL(String(input)).pathname)?.[1] ?? "")
      if (!picked.has(ability)) {
        picked.set(
          ability,
          trustOf(ability).then(trust => pickSandbox(userId, ability, { trust }))
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
        const key = keys(ability)?.value
        const response = await tunnel.request(pseudonymFor(userId, tunnel.id), input, { ...init, body }, key)
        if (response.status !== 503 || !response.headers.has(SANDBOX_FULL_HEADER) || attempt >= FULL_RETRIES) {
          return response
        }
        await response.body?.cancel()
        skip.add(tunnel.id)
        picked.set(ability, pickSandbox(userId, ability, { trust: await trustOf(ability), skip }))
      }
    },
    close: async () => {
      await Promise.all(
        [...picked].map(async ([ability, pending]) => {
          const current = await pending.catch(() => undefined)
          if (current?.borrowed) current.tunnel.release(pseudonymFor(userId, current.tunnel.id), ability)
        })
      )
    }
  }
}

/** Thrown by {@link egressFor}'s senders when no sandbox can send the request: a cloud turn never sends it from here. */
export class NoSandboxError extends Error {
  constructor() {
    super("no sandbox is online to send this request right now")
    this.name = "NoSandboxError"
  }
}

/**
 * A turn's egress (nasi's `egress`): every tool request goes out through a sandbox, never from the API. `fetch_url`
 * (no ability) may use any sandbox the user may; an ability's requests go where the key they carry may go
 * ({@link keyTrust}, by `keys`; without `keys`, only the official box), and a trustedSandbox one never to a borrowed
 * sandbox. Each trust level keeps the sandbox it first picked for the turn, picking again only when that one disconnects.
 */
export function egressFor(userId: string, keys?: SandboxKeys): (ability?: string) => FetchLike {
  const picked = new Map<SandboxTrust, Promise<SandboxPick | undefined>>()
  const needsTrust = trustedAbilities(userId)
  const sendAt =
    (trust: () => Promise<SandboxTrust>): FetchLike =>
    async (input, init) => {
      const level = await trust()
      let current = await picked.get(level)
      if (!current || current.tunnel.closed) {
        const next = pickSandbox(userId, null, { trust: level })
        picked.set(level, next)
        current = await next
      }
      if (!current) throw new NoSandboxError()
      return current.tunnel.fetch(pseudonymFor(userId, current.tunnel.id), input, init)
    }
  return ability => {
    if (ability === undefined) return sendAt(() => Promise.resolve("any"))
    return sendAt(async () => {
      if (!keys) return "official"
      const needed = (await needsTrust(ability)) ? "trusted" : "any"
      return strictest(needed, keyTrust(keys(ability)))
    })
  }
}
