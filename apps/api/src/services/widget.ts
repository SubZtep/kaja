import { createHash, randomBytes } from "node:crypto"
import type { WidgetConfig, WidgetKey } from "@kaja/schema/api"
import { widgetConfigSchema } from "@kaja/schema/api"
import type { Pool } from "pg"

const KEY_PREFIX = "kwk_"

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex")
}

export class WidgetService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** Returns the raw key alongside the row — the only time the raw key is ever available; only its hash is stored. */
  async createKey(
    userId: string,
    label: string,
    allowedOrigins: string[],
    config?: WidgetConfig
  ): Promise<WidgetKey & { rawKey: string }> {
    const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`
    const result = await this.#db.query(
      `
      INSERT INTO widget (user_id, label, key_prefix, key_hash, allowed_origins, config)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [userId, label, rawKey.slice(0, 12), hashKey(rawKey), allowedOrigins, JSON.stringify(config ?? {})]
    )
    return { ...this.#rowToWidgetKey(result.rows[0]), rawKey }
  }

  async listKeys(userId: string): Promise<WidgetKey[]> {
    const { rows } = await this.#db.query(`SELECT * FROM widget WHERE user_id = $1 ORDER BY created_at`, [userId])
    return rows.map(row => this.#rowToWidgetKey(row))
  }

  /** Changes a key's label, origins or config (config is replaced whole); null when the key isn't this user's. */
  async updateKey(
    userId: string,
    id: string,
    patch: { label?: string; allowedOrigins?: string[]; config?: WidgetConfig }
  ): Promise<WidgetKey | null> {
    const columns: Record<string, unknown> = {}
    if (patch.label !== undefined) columns.label = patch.label
    if (patch.allowedOrigins !== undefined) columns.allowed_origins = patch.allowedOrigins
    if (patch.config !== undefined) columns.config = JSON.stringify(patch.config)
    const entries = Object.entries(columns)
    if (entries.length === 0) return (await this.listKeys(userId)).find(key => key.id === id) ?? null

    const assignments = entries.map(([column], index) => `${column} = $${index + 3}`).join(", ")
    const { rows } = await this.#db.query(
      `UPDATE widget SET ${assignments} WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, ...entries.map(([, value]) => value)]
    )
    return rows[0] ? this.#rowToWidgetKey(rows[0]) : null
  }

  async revokeKey(userId: string, id: string): Promise<boolean> {
    const result = await this.#db.query(`UPDATE widget SET enabled = false WHERE id = $1 AND user_id = $2`, [
      id,
      userId
    ])
    return result.rowCount !== null && result.rowCount > 0
  }

  /** Resolves a raw widget key from an incoming request to its owning account and origin allowlist, or null if unknown/disabled. */
  async resolveByRawKey(
    rawKey: string
  ): Promise<{ id: string; userId: string; allowedOrigins: string[]; config: WidgetConfig } | null> {
    const { rows } = await this.#db.query(
      `SELECT id, user_id, allowed_origins, config FROM widget WHERE key_hash = $1 AND enabled`,
      [hashKey(rawKey)]
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      userId: row.user_id,
      allowedOrigins: row.allowed_origins,
      config: widgetConfigSchema.parse(row.config)
    }
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.#db.query(`UPDATE widget SET last_used_at = NOW() WHERE id = $1`, [id])
  }

  #rowToWidgetKey(row: any): WidgetKey {
    return {
      id: row.id,
      label: row.label,
      keyPrefix: row.key_prefix,
      allowedOrigins: row.allowed_origins,
      config: widgetConfigSchema.parse(row.config),
      enabled: row.enabled,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null
    }
  }
}
