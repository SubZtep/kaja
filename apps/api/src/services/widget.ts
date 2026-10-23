import { createHash, randomBytes } from "node:crypto"
import type { WidgetConfig, WidgetKey } from "@kaja/schema/api"
import { widgetConfigSchema } from "@kaja/schema/api"
import type { SQL } from "bun"

const KEY_PREFIX = "kwk_"

type WidgetRow = {
  id: string
  label: string
  key_prefix: string
  allowed_origins: string[]
  config: unknown
  enabled: boolean
  created_at: Date
  last_used_at: Date | null
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex")
}

export class WidgetService {
  readonly #db: SQL

  constructor(db: SQL) {
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
    const [row] = await this.#db<WidgetRow[]>`
      INSERT INTO widget (user_id, label, key_prefix, key_hash, allowed_origins, config)
      VALUES (${userId}, ${label}, ${rawKey.slice(0, 12)}, ${hashKey(rawKey)}, ${allowedOrigins},
              ${this.#db.json(config ?? {})})
      RETURNING *`
    return { ...this.#rowToWidgetKey(row!), rawKey }
  }

  async listKeys(userId: string): Promise<WidgetKey[]> {
    const rows = await this.#db<WidgetRow[]>`SELECT * FROM widget WHERE user_id = ${userId} ORDER BY created_at`
    return rows.map(row => this.#rowToWidgetKey(row))
  }

  /** Changes a key's label, origins or config (config is replaced whole); null when the key isn't this user's. */
  async updateKey(
    userId: string,
    id: string,
    patch: { label?: string; allowedOrigins?: string[]; config?: WidgetConfig }
  ): Promise<WidgetKey | null> {
    // A field left out keeps its value
    const [row] = await this.#db<WidgetRow[]>`
      UPDATE widget SET
        label = COALESCE(${patch.label ?? null}, label),
        allowed_origins = COALESCE(${patch.allowedOrigins ?? null}, allowed_origins),
        config = COALESCE(${patch.config === undefined ? null : this.#db.json(patch.config)}, config)
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *`
    return row ? this.#rowToWidgetKey(row) : null
  }

  async revokeKey(userId: string, id: string): Promise<boolean> {
    const result = await this.#db`UPDATE widget SET enabled = false WHERE id = ${id} AND user_id = ${userId}`
    return result.affectedRows > 0
  }

  /**
   * Resolves a raw widget key from an incoming request to its owning account and origin allowlist, or null if
   * unknown/disabled.
   */
  async resolveByRawKey(
    rawKey: string
  ): Promise<{ id: string; userId: string; allowedOrigins: string[]; config: WidgetConfig } | null> {
    const [row] = await this.#db<{ id: string; user_id: string; allowed_origins: string[]; config: unknown }[]>`
      SELECT id, user_id, allowed_origins, config FROM widget WHERE key_hash = ${hashKey(rawKey)} AND enabled`
    if (!row) return null
    return {
      id: row.id,
      userId: row.user_id,
      allowedOrigins: row.allowed_origins,
      config: widgetConfigSchema.parse(row.config)
    }
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.#db`UPDATE widget SET last_used_at = NOW() WHERE id = ${id}`
  }

  #rowToWidgetKey(row: WidgetRow): WidgetKey {
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
