import { createHash, randomBytes } from "node:crypto"
import type { WidgetKey } from "@kaja/schema/api"
import type { Pool } from "pg"

const KEY_PREFIX = "kwk_"

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex")
}

export class WidgetKeyService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** Returns the raw key alongside the row — the only time the raw key is ever available; only its hash is stored. */
  async createKey(
    userId: string,
    label: string,
    allowedOrigins: string[],
    personaId?: string | null
  ): Promise<WidgetKey & { rawKey: string }> {
    const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`
    const result = await this.#db.query(
      `
      INSERT INTO widget_key (user_id, label, key_prefix, key_hash, allowed_origins, persona_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [userId, label, rawKey.slice(0, 12), hashKey(rawKey), allowedOrigins, personaId ?? null]
    )
    return { ...this.#rowToWidgetKey(result.rows[0]), rawKey }
  }

  async listKeys(userId: string): Promise<WidgetKey[]> {
    const { rows } = await this.#db.query(`SELECT * FROM widget_key WHERE user_id = $1 ORDER BY created_at`, [userId])
    return rows.map(row => this.#rowToWidgetKey(row))
  }

  async revokeKey(userId: string, id: string): Promise<boolean> {
    const result = await this.#db.query(`UPDATE widget_key SET enabled = false WHERE id = $1 AND user_id = $2`, [
      id,
      userId
    ])
    return result.rowCount !== null && result.rowCount > 0
  }

  /** Resolves a raw widget key from an incoming request to its owning account and origin allowlist, or null if unknown/disabled. */
  async resolveByRawKey(
    rawKey: string
  ): Promise<{ id: string; userId: string; allowedOrigins: string[]; personaId: string | null } | null> {
    const { rows } = await this.#db.query(
      `SELECT id, user_id, allowed_origins, persona_id FROM widget_key WHERE key_hash = $1 AND enabled`,
      [hashKey(rawKey)]
    )
    const row = rows[0]
    if (!row) return null
    return { id: row.id, userId: row.user_id, allowedOrigins: row.allowed_origins, personaId: row.persona_id }
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.#db.query(`UPDATE widget_key SET last_used_at = NOW() WHERE id = $1`, [id])
  }

  #rowToWidgetKey(row: any): WidgetKey {
    return {
      id: row.id,
      label: row.label,
      keyPrefix: row.key_prefix,
      allowedOrigins: row.allowed_origins,
      personaId: row.persona_id,
      enabled: row.enabled,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null
    }
  }
}
