import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
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

/** Binds a ciphertext to its owner and name, so a row copied to another name fails to decrypt. */
function associatedData(owner: string, name: string): Buffer {
  return Buffer.from(`${owner}\0${name}`, "utf8")
}

// A service secret's owner in its associated data.
const SERVICE_OWNER = "service"

type SealedRow = { name: string; ciphertext: Buffer; iv: Buffer; tag: Buffer }

/**
 * The server-wide secrets admins manage (ability API keys every user shares) in `service_secret`, AES-256-GCM
 * encrypted at rest. Values are decrypted only for turns and key checks; nothing here ever returns one to a client.
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

  /** Stores (or replaces) a server-wide secret. Throws {@link SecretsUnavailableError} without a key. */
  async setService(name: string, value: string): Promise<void> {
    const { ciphertext, iv, tag } = this.#seal(SERVICE_OWNER, name, value)
    await this.#db.query(
      `
      INSERT INTO service_secret (name, ciphertext, iv, tag) VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE SET
        ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, tag = EXCLUDED.tag, updated_at = NOW()
      `,
      [name, ciphertext, iv, tag]
    )
  }

  /** The server-wide secrets whose name starts with `prefix`, decrypted; ones that don't decrypt are left out with a warning. */
  async getAllService(prefix: string): Promise<Map<string, string>> {
    const secrets = new Map<string, string>()
    if (!this.#key) return secrets
    const { rows } = await this.#db.query<SealedRow>(
      "SELECT name, ciphertext, iv, tag FROM service_secret WHERE starts_with(name, $1)",
      [prefix]
    )
    for (const row of rows) {
      const value = this.#open(SERVICE_OWNER, row)
      if (value === undefined) console.warn("Service secret doesn't decrypt; ignoring it", { name: row.name })
      else secrets.set(row.name, value)
    }
    return secrets
  }

  /** Names (starting with `prefix`) that have a server-wide secret, without decrypting anything; none while secrets are off. */
  async serviceNames(prefix: string): Promise<Set<string>> {
    if (!this.#key) return new Set()
    const { rows } = await this.#db.query("SELECT name FROM service_secret WHERE starts_with(name, $1)", [prefix])
    return new Set(rows.map(row => row.name as string))
  }

  /** Removes a server-wide secret; false when there was none. */
  async deleteService(name: string): Promise<boolean> {
    const result = await this.#db.query("DELETE FROM service_secret WHERE name = $1", [name])
    return (result.rowCount ?? 0) > 0
  }

  #seal(owner: string, name: string, value: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    if (!this.#key) throw new SecretsUnavailableError()
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.#key, iv)
    cipher.setAAD(associatedData(owner, name))
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
    return { ciphertext, iv, tag: cipher.getAuthTag() }
  }

  // Undefined when it doesn't decrypt: another key, or a row moved to another owner or name.
  #open(owner: string, row: SealedRow): string | undefined {
    if (!this.#key) return undefined
    try {
      const decipher = createDecipheriv(ALGORITHM, this.#key, row.iv)
      decipher.setAAD(associatedData(owner, row.name))
      decipher.setAuthTag(row.tag)
      return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString("utf8")
    } catch {
      return undefined
    }
  }
}
