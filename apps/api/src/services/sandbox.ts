import { createHash, randomBytes } from "node:crypto"
import type { Sandbox, SandboxInfo, SandboxLoad, SandboxSample } from "@kaja/schema/api"
import type { SQL } from "bun"
import type { GeoLocation } from "../core/geo"

/** Whose a connecting sandbox is: the operator's own, a user's (by their key), or nobody's. */
export type SandboxOwner = { kind: "official" } | { kind: "owned"; userId: string } | { kind: "anonymous" }

/** A user's sandbox settings: others may use theirs (`share`), and they may use others' (`useShared`). */
export type SandboxSettings = { share: boolean; useShared: boolean; hasKey: boolean; keyCreatedAt: Date | null }

type SandboxRow = {
  id: string
  user_id: string | null
  official: boolean
  name: string | null
  online: boolean
  connected_at: Date | null
  last_seen_at: Date | null
  country: string | null
  country_code: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  info: SandboxInfo | null
  load: SandboxLoad | null
  created_at: Date
}

/** The prefix of a user's sandbox key, so one pasted in the wrong place is recognisable. */
const KEY_PREFIX = "ks_"

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function newSecret(): string {
  return randomBytes(24).toString("base64url")
}

function sandboxKind(row: SandboxRow): Sandbox["kind"] {
  if (row.official) return "official"
  return row.user_id ? "owned" : "anonymous"
}

/** Registered MCP sandboxes (`sandbox`) and users' sandbox keys and settings (`sandbox_owner`). */
export class SandboxService {
  readonly #db: SQL

  constructor(db: SQL) {
    this.#db = db
  }

  // A fixed fragment, never built from input
  get #columns() {
    return this.#db`
      s.id::text AS id, s.user_id::text AS user_id, s.official, s.name, s.online, s.connected_at, s.last_seen_at,
      s.country, s.country_code, s.city, s.latitude, s.longitude, s.info, s.load, s.created_at`
  }

  /** The user a sandbox key belongs to, if any. */
  async userForKey(key: string): Promise<string | undefined> {
    const [row] = await this.#db<{ user_id: string }[]>`
      SELECT user_id::text FROM sandbox_owner WHERE key_hash = ${sha256(key)}`
    return row?.user_id
  }

  /**
   * Makes (or replaces) the user's sandbox key and returns it: the only time it's readable, since only its hash is
   * kept.
   */
  async createKey(userId: string): Promise<string> {
    const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`
    await this.#db`
      INSERT INTO sandbox_owner (user_id, key_hash, key_created_at) VALUES (${userId}, ${sha256(key)}, now())
      ON CONFLICT (user_id) DO UPDATE SET key_hash = EXCLUDED.key_hash, key_created_at = EXCLUDED.key_created_at`
    return key
  }

  /** The user's settings, defaults when they have none yet. */
  async settings(userId: string): Promise<SandboxSettings> {
    const [row] = await this.#db<
      { share: boolean; use_shared: boolean; key_hash: string | null; key_created_at: Date | null }[]
    >`SELECT share, use_shared, key_hash, key_created_at FROM sandbox_owner WHERE user_id = ${userId}`
    return {
      share: row?.share ?? true,
      useShared: row?.use_shared ?? false,
      hasKey: Boolean(row?.key_hash),
      keyCreatedAt: row?.key_created_at ?? null
    }
  }

  /** Changes the user's settings, keeping what's left out. */
  async updateSettings(userId: string, patch: { share?: boolean; useShared?: boolean }): Promise<SandboxSettings> {
    const share = patch.share ?? null
    const useShared = patch.useShared ?? null
    await this.#db`
      INSERT INTO sandbox_owner (user_id, share, use_shared)
      VALUES (${userId}, COALESCE(${share}::boolean, true), COALESCE(${useShared}::boolean, false))
      ON CONFLICT (user_id) DO UPDATE SET share = COALESCE(${share}::boolean, sandbox_owner.share),
        use_shared = COALESCE(${useShared}::boolean, sandbox_owner.use_shared)`
    return this.settings(userId)
  }

  /**
   * Registers a connecting sandbox, online: the row `instance` names when its secret holds and the owner is the same,
   * else a new row, whose secret is returned (the only time) for the sandbox to come back with.
   */
  async register(opts: {
    owner: SandboxOwner
    instance?: { id: string; secret: string }
    info: SandboxInfo
    ip: string | undefined
    geo: GeoLocation | undefined
  }): Promise<{ id: string; secret?: string }> {
    const userId = opts.owner.kind === "owned" ? opts.owner.userId : null
    const official = opts.owner.kind === "official"
    const geo = opts.geo
    const place = {
      name: opts.info.name,
      ip: opts.ip ?? null,
      geo: geo ? this.#db.json(geo.raw) : null,
      country: geo?.country ?? null,
      country_code: geo?.countryCode ?? null,
      city: geo?.city ?? null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      info: this.#db.json(opts.info)
    }
    if (opts.instance && /^[0-9a-f-]{36}$/i.test(opts.instance.id)) {
      const [row] = await this.#db<{ id: string }[]>`
        UPDATE sandbox SET ${this.#db(place)}, load = NULL, online = true, connected_at = now(), last_seen_at = now()
        WHERE id = ${opts.instance.id} AND secret_hash = ${sha256(opts.instance.secret)}
          AND user_id IS NOT DISTINCT FROM ${userId}::uuid AND official = ${official}
        RETURNING id::text`
      if (row) return { id: row.id }
    }
    const secret = newSecret()
    const [row] = await this.#db<{ id: string }[]>`
      INSERT INTO sandbox ${this.#db({
        ...place,
        user_id: userId,
        official,
        secret_hash: sha256(secret),
        online: true,
        connected_at: this.#db`now()`,
        last_seen_at: this.#db`now()`
      })}
      RETURNING id::text`
    return { id: row!.id, secret }
  }

  /** Records a heartbeat: how busy it is, that it's still there, and a sample for its load chart. */
  async heartbeat(id: string, load: SandboxLoad): Promise<void> {
    await this.#db`
      WITH updated AS (UPDATE sandbox SET load = ${this.#db.json(load)}, last_seen_at = now() WHERE id = ${id} RETURNING id)
      INSERT INTO sandbox_sample (sandbox_id, running, load, memory_used)
      SELECT id, ${load.running}::int, ${load.load}::real, ${Math.round(load.memoryUsed)}::bigint FROM updated
      ON CONFLICT DO NOTHING`
  }

  /** A sandbox's load over the last `hours`, averaged into about `points` buckets (peak for `running`), oldest first. */
  async samples(id: string, hours: number, points = 120): Promise<SandboxSample[]> {
    const bucketSeconds = Math.max(60, Math.ceil((hours * 3600) / points))
    const rows = await this.#db<{ at: Date; running: number; load: number; memory_used: string }[]>`
      SELECT date_bin(make_interval(secs => ${bucketSeconds}), at, TIMESTAMPTZ '2000-01-01') AS at,
        max(running) AS running, avg(load)::real AS load, avg(memory_used)::bigint AS memory_used
      FROM sandbox_sample WHERE sandbox_id = ${id} AND at > now() - make_interval(hours => ${hours})
      GROUP BY 1 ORDER BY 1`
    return rows.map(row => ({ at: row.at, running: row.running, load: row.load, memoryUsed: Number(row.memory_used) }))
  }

  /** Drops load samples older than `olderThanMs`. */
  async pruneSamples(olderThanMs: number): Promise<number> {
    const result = await this.#db`
      DELETE FROM sandbox_sample WHERE at < now() - make_interval(secs => ${olderThanMs / 1000})`
    return result.affectedRows as number
  }

  async setOffline(id: string): Promise<void> {
    await this.#db`UPDATE sandbox SET online = false, last_seen_at = now() WHERE id = ${id}`
  }

  /** At startup no sandbox is connected yet, whatever the rows say from before. */
  async markAllOffline(): Promise<void> {
    await this.#db`UPDATE sandbox SET online = false WHERE online`
  }

  /** Every sandbox, online first, then the most recently seen (the admin dashboard). */
  async list(): Promise<Sandbox[]> {
    const rows = await this.#db<SandboxRow[]>`
      SELECT ${this.#columns} FROM sandbox s ORDER BY online DESC, last_seen_at DESC NULLS LAST, created_at DESC`
    return rows.map(row => this.#rowToSandbox(row))
  }

  /** The user's own sandboxes, online first. */
  async listForUser(userId: string): Promise<Sandbox[]> {
    const rows = await this.#db<SandboxRow[]>`
      SELECT ${this.#columns} FROM sandbox s WHERE user_id = ${userId}
      ORDER BY online DESC, last_seen_at DESC NULLS LAST, created_at DESC`
    return rows.map(row => this.#rowToSandbox(row))
  }

  /** The sandboxes `userId` may run in, online ones only: their own, and when they allow it, the ones others share. */
  async usableBy(userId: string, useShared: boolean): Promise<Sandbox[]> {
    const rows = await this.#db<SandboxRow[]>`
      SELECT ${this.#columns} FROM sandbox s
      LEFT JOIN sandbox_owner o ON o.user_id = s.user_id
      WHERE s.online AND (s.user_id = ${userId} OR s.official
        OR (${useShared} AND (s.user_id IS NULL OR COALESCE(o.share, true))))`
    return rows.map(row => this.#rowToSandbox(row))
  }

  /** How many sandboxes are online, by country (the landing page). */
  async onlineByCountry(): Promise<{ online: number; countries: { code: string; name: string; count: number }[] }> {
    const rows = await this.#db<{ code: string | null; name: string | null; count: string }[]>`
      SELECT country_code AS code, country AS name, count(*) AS count FROM sandbox WHERE online
      GROUP BY country_code, country ORDER BY count(*) DESC`
    return {
      online: rows.reduce((sum, row) => sum + Number(row.count), 0),
      countries: rows.flatMap(row =>
        row.code && row.name ? [{ code: row.code, name: row.name, count: Number(row.count) }] : []
      )
    }
  }

  /** Removes one of the user's own sandboxes that's offline; false when there's no such row. */
  async deleteOffline(userId: string, id: string): Promise<boolean> {
    const result = await this.#db`DELETE FROM sandbox WHERE id = ${id} AND user_id = ${userId} AND NOT online`
    return result.affectedRows > 0
  }

  /** Drops anonymous sandboxes offline for longer than `olderThanMs` (a restart without a volume leaves one behind). */
  async pruneAnonymous(olderThanMs: number): Promise<number> {
    const result = await this.#db`
      DELETE FROM sandbox WHERE user_id IS NULL AND NOT official AND NOT online
      AND COALESCE(last_seen_at, created_at) < now() - make_interval(secs => ${olderThanMs / 1000})`
    return result.affectedRows as number
  }

  #rowToSandbox(row: SandboxRow): Sandbox {
    return {
      id: row.id,
      kind: sandboxKind(row),
      ownerId: row.user_id,
      name: row.name,
      online: row.online,
      connectedAt: row.connected_at,
      lastSeenAt: row.last_seen_at,
      country: row.country,
      countryCode: row.country_code,
      city: row.city,
      latitude: row.latitude,
      longitude: row.longitude,
      info: row.info,
      load: row.load,
      createdAt: row.created_at
    }
  }
}
