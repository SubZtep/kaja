import { createHash, randomBytes } from "node:crypto"
import type { Pool } from "pg"

const TOKEN_TTL_MS = 10 * 60 * 1000

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

export class TelegramLinkService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** Returns the raw token — the only time it's ever available; only its hash is stored. */
  async createLinkToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(18).toString("base64url")
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await this.#db.query(`INSERT INTO telegram_link_token (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
      hashToken(token),
      userId,
      expiresAt
    ])
    return { token, expiresAt }
  }

  /** Resolves and consumes a raw link token, or returns undefined if unknown/expired. Deletes the token either way — single use. */
  async consumeLinkToken(rawToken: string): Promise<string | undefined> {
    const tokenHash = hashToken(rawToken)
    const result = await this.#db.query(
      `DELETE FROM telegram_link_token WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id`,
      [tokenHash]
    )
    return result.rows[0]?.user_id
  }

  /** Links a Telegram account to a Kaja account. Returns false if that Telegram id is already linked to a *different* account. */
  async link(telegramUserId: number, userId: string): Promise<boolean> {
    const existing = await this.resolveUserId(telegramUserId)
    if (existing && existing !== userId) return false
    await this.#db.query(
      `INSERT INTO telegram_link (telegram_user_id, user_id) VALUES ($1, $2)
       ON CONFLICT (telegram_user_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [telegramUserId, userId]
    )
    return true
  }

  async resolveUserId(telegramUserId: number): Promise<string | undefined> {
    const result = await this.#db.query(`SELECT user_id FROM telegram_link WHERE telegram_user_id = $1`, [
      telegramUserId
    ])
    return result.rows[0]?.user_id
  }
}
