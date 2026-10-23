import { createHash, randomBytes } from "node:crypto"
import type { SQL } from "bun"

/** Time-to-live for a Telegram link token. */
const TOKEN_TTL_MS = 10 * 60 * 1000

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

export class TelegramLinkService {
  readonly #db: SQL

  constructor(db: SQL) {
    this.#db = db
  }

  /**
   * Returns the raw token — the only time it's ever available; only its hash is stored. Invalidates any earlier unused
   * token for this user first, so at most one link is ever outstanding.
   */
  async createLinkToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(18).toString("base64url")
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await this.#db.begin(async tx => {
      await tx`DELETE FROM telegram_link_token WHERE user_id = ${userId}`
      await tx`INSERT INTO telegram_link_token (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expiresAt})`
    })
    return { token, expiresAt }
  }

  /**
   * Read-only lookup, so a link can be shown for confirmation before it's consumed. Returns undefined if
   * unknown/expired.
   */
  async peekLinkToken(rawToken: string): Promise<{ userId: string; email: string; locale: string | null } | undefined> {
    const [row] = await this.#db<{ user_id: string; email: string; locale: string | null }[]>`
      SELECT t.user_id, u.email, u.locale FROM telegram_link_token t
      JOIN "user" u ON u.id = t.user_id
      WHERE t.token_hash = ${hashToken(rawToken)} AND t.expires_at > NOW()`
    return row ? { userId: row.user_id, email: row.email, locale: row.locale } : undefined
  }

  /**
   * Deletes a link token by its raw value. Returns whether a row was actually removed, so a caller can detect a
   * double-confirm race.
   */
  async deleteLinkToken(rawToken: string): Promise<boolean> {
    const result = await this.#db`DELETE FROM telegram_link_token WHERE token_hash = ${hashToken(rawToken)}`
    return result.affectedRows > 0
  }

  /**
   * Links a Telegram account to a Kaja account. Returns false if that Telegram id is already linked to a _different_
   * account.
   */
  async link(telegramUserId: number, userId: string): Promise<boolean> {
    const existing = await this.resolveUserId(telegramUserId)
    if (existing && existing !== userId) return false
    await this.#db`
      INSERT INTO telegram_link (telegram_user_id, user_id) VALUES (${telegramUserId}, ${userId})
      ON CONFLICT (telegram_user_id) DO UPDATE SET user_id = EXCLUDED.user_id`
    return true
  }

  /** When the Kaja account was last linked to a Telegram account, or null when it isn't. */
  async linkedAt(userId: string): Promise<Date | null> {
    const [row] = await this.#db<{ linked_at: Date | null }[]>`
      SELECT max(linked_at) AS linked_at FROM telegram_link WHERE user_id = ${userId}`
    return row?.linked_at ? new Date(row.linked_at) : null
  }

  /**
   * Disconnects every Telegram account linked to the Kaja account (and drops an unused link token); false when none was
   * linked.
   */
  async unlink(userId: string): Promise<boolean> {
    await this.#db`DELETE FROM telegram_link_token WHERE user_id = ${userId}`
    const result = await this.#db`DELETE FROM telegram_link WHERE user_id = ${userId}`
    return result.affectedRows > 0
  }

  /**
   * The Kaja account a Telegram user is linked to, with its saved language (null until a client sets one), or undefined
   * if unlinked.
   */
  async resolveUser(telegramUserId: number): Promise<{ userId: string; locale: string | null } | undefined> {
    const [row] = await this.#db<{ user_id: string; locale: string | null }[]>`
      SELECT l.user_id, u.locale FROM telegram_link l JOIN "user" u ON u.id = l.user_id
      WHERE l.telegram_user_id = ${telegramUserId}`
    return row ? { userId: row.user_id, locale: row.locale } : undefined
  }

  async resolveUserId(telegramUserId: number): Promise<string | undefined> {
    const [row] = await this.#db<{ user_id: string }[]>`
      SELECT user_id FROM telegram_link WHERE telegram_user_id = ${telegramUserId}`
    return row?.user_id
  }
}
