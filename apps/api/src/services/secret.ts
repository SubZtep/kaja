import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { warn } from "@kaja/logger"
import type { Pool } from "pg"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

/** Thrown when a secret is written while USER_SECRET_KEY isn't set. */
export class SecretsUnavailableError extends Error {
  constructor() {
    super("secrets_unavailable")
    this.name = "SecretsUnavailableError"
  }
}

/** Binds a ciphertext to its owner and name, so a row copied to another user or name fails to decrypt. */
function associatedData(userId: string, name: string): Buffer {
  return Buffer.from(`${userId}\0${name}`, "utf8")
}

/**
 * Users' own secrets (ability API keys), AES-256-GCM encrypted at rest in `user_secret`. Values are
 * decrypted only for the owner's turns and key checks; nothing here ever returns one to a client.
 * Without a key (USER_SECRET_KEY unset) nothing can be written, and reads find nothing.
 */
export class SecretService {
  readonly #db: Pool
  #key: Buffer | undefined

  /** @param key - USER_SECRET_KEY: 32 bytes, base64-encoded. */
  constructor(db: Pool, key: string | undefined) {
    this.#db = db
    this.#key = key ? Buffer.from(key, "base64") : undefined
  }

  /** False when USER_SECRET_KEY isn't set, so keys can't be stored or used. */
  get enabled(): boolean {
    return this.#key !== undefined
  }

  /** Test seam: swaps the encryption key (undefined turns secrets off). */
  setKey(key: string | undefined) {
    this.#key = key ? Buffer.from(key, "base64") : undefined
  }

  /** Stores (or replaces) the user's secret. Throws {@link SecretsUnavailableError} without a key. */
  async set(userId: string, name: string, value: string): Promise<void> {
    if (!this.#key) throw new SecretsUnavailableError()
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.#key, iv)
    cipher.setAAD(associatedData(userId, name))
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
    await this.#db.query(
      `
      INSERT INTO user_secret (user_id, name, ciphertext, iv, tag) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, name) DO UPDATE SET
        ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, tag = EXCLUDED.tag, updated_at = NOW()
      `,
      [userId, name, ciphertext, iv, cipher.getAuthTag()]
    )
  }

  /** The user's secret, or undefined when there's none, secrets are off, or it no longer decrypts (e.g. the key changed). */
  async get(userId: string, name: string): Promise<string | undefined> {
    return (await this.getAll(userId, name)).get(name)
  }

  /** The user's secrets whose name starts with `prefix`, decrypted; ones that don't decrypt are left out with a warning. */
  async getAll(userId: string, prefix: string): Promise<Map<string, string>> {
    const secrets = new Map<string, string>()
    if (!this.#key) return secrets
    const { rows } = await this.#db.query(
      "SELECT name, ciphertext, iv, tag FROM user_secret WHERE user_id = $1 AND starts_with(name, $2)",
      [userId, prefix]
    )
    for (const row of rows) {
      try {
        const decipher = createDecipheriv(ALGORITHM, this.#key, row.iv)
        decipher.setAAD(associatedData(userId, row.name))
        decipher.setAuthTag(row.tag)
        secrets.set(row.name, Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8"))
      } catch {
        warn("User secret doesn't decrypt; ignoring it", { userId, name: row.name })
      }
    }
    return secrets
  }

  /** Names (starting with `prefix`) the user has a secret for, without decrypting anything. */
  async names(userId: string, prefix: string): Promise<Set<string>> {
    const { rows } = await this.#db.query("SELECT name FROM user_secret WHERE user_id = $1 AND starts_with(name, $2)", [
      userId,
      prefix
    ])
    return new Set(rows.map(row => row.name as string))
  }

  /** Whether the user has this secret stored (it may still fail to decrypt if the key changed). */
  async has(userId: string, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT 1 FROM user_secret WHERE user_id = $1 AND name = $2", [userId, name])
    return rows.length > 0
  }

  /** Removes the user's secret; false when there was none. */
  async delete(userId: string, name: string): Promise<boolean> {
    const result = await this.#db.query("DELETE FROM user_secret WHERE user_id = $1 AND name = $2", [userId, name])
    return (result.rowCount ?? 0) > 0
  }
}
