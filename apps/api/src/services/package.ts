import { warn } from "@kaja/logger"
import { checkHttpToolKey, type KeyCheckResult, parseHttpToolManifest, parseSkillMd } from "@kaja/nasi"
import type { CatalogPackage, PackageKeyNeed, PackageType, SkillDetail, UserPackage } from "@kaja/schema/api"
import type { HttpToolPackage } from "@kaja/schema/packages"
import type { Pool } from "pg"
import type { SecretService } from "./secret"

/** An enabled skill with its files, for the agent's Postgres PackageStore. */
export type CloudSkill = { name: string; description: string; files: Record<string, string> }

export type EnableResult = "enabled" | "not_found" | "key_required"

/** A saved key and its live test (null when the package has no `check`), or why it wasn't saved. */
export type SaveKeyResult = { check: KeyCheckResult | null } | "not_found" | "no_key"

// Offered in the cloud: still in the marketplace, and nothing that needs a shell.
const AVAILABLE = "p.removed_at IS NULL AND NOT p.has_scripts"
const KEY_PREFIX = "package:"

/** Where a package's API key lives in `user_secret`. */
export function packageSecretName(name: string): string {
  return `${KEY_PREFIX}${name}`
}

function keyNeed(pkg: HttpToolPackage): PackageKeyNeed {
  if (pkg.auth.type !== "apiKey") return "none"
  return pkg.auth.optional ? "optional" : "required"
}

export class PackageService {
  readonly #db: Pool
  readonly #secrets: SecretService

  constructor(db: Pool, secrets: SecretService) {
    this.#db = db
    this.#secrets = secrets
  }

  /** Whether users' keys can be stored (USER_SECRET_KEY is set); without it, tools that require a key are left out everywhere. */
  get keysEnabled(): boolean {
    return this.#secrets.enabled
  }

  /** What users can enable: available skills and HTTP tools, by type and name. */
  async listCatalog(): Promise<CatalogPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, p.updated_at, CASE WHEN p.type = 'tool' THEN p.files END AS files
      FROM package p WHERE ${AVAILABLE} ORDER BY p.type, p.name
      `
    )
    const catalog: CatalogPackage[] = []
    for (const row of rows) {
      const entry: CatalogPackage = {
        type: row.type,
        name: row.name,
        description: row.description,
        updatedAt: new Date(row.updated_at)
      }
      if (row.type === "tool") {
        const pkg = this.#usableTool(row)
        if (!pkg) continue
        entry.http = {
          domain: new URL(pkg.baseUrl).host,
          key: keyNeed(pkg),
          tools: pkg.tools.map(tool => ({ name: tool.name, method: tool.method, description: tool.description }))
        }
      }
      catalog.push(entry)
    }
    return catalog
  }

  /** One available skill in full (instructions and file names), or null when it isn't in the catalog. */
  async getSkill(name: string): Promise<SkillDetail | null> {
    const { rows } = await this.#db.query(
      `SELECT p.name, p.description, p.files, p.updated_at FROM package p WHERE p.type = 'skill' AND p.name = $1 AND ${AVAILABLE}`,
      [name]
    )
    const row = rows[0]
    if (!row) return null
    let instructions = ""
    try {
      instructions = parseSkillMd(row.files["SKILL.md"] ?? "", row.name).body
    } catch {}
    return {
      name: row.name,
      description: row.description,
      instructions,
      files: Object.keys(row.files)
        .filter(path => path !== "SKILL.md")
        .sort(),
      updatedAt: new Date(row.updated_at)
    }
  }

  /** The user's selections, including ones that left the marketplace or can't run here (`available: false`). */
  async listForUser(userId: string): Promise<UserPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, up.enabled_at, (${AVAILABLE}) AS available,
        CASE WHEN p.type = 'tool' THEN p.files END AS files
      FROM user_package up JOIN package p ON p.id = up.package_id
      WHERE up.user_id = $1
      ORDER BY p.type, p.name
      `,
      [userId]
    )
    return rows.map(row => ({
      type: row.type,
      name: row.name,
      description: row.description,
      enabledAt: new Date(row.enabled_at),
      available: row.available && (row.type !== "tool" || this.#usableTool(row) !== undefined)
    }))
  }

  /** Packages the user saved a key for, on or off. */
  async keyNames(userId: string): Promise<string[]> {
    return [...(await this.#secrets.names(userId, KEY_PREFIX))].map(name => name.slice(KEY_PREFIX.length)).sort()
  }

  /** Enables an available package for the user. Enabling twice is fine; a tool that requires a key needs one saved first. */
  async enable(userId: string, type: PackageType, name: string): Promise<EnableResult> {
    if (type === "tool") {
      const pkg = await this.getTool(name)
      if (!pkg) return "not_found"
      if (keyNeed(pkg) === "required" && !(await this.#secrets.has(userId, packageSecretName(name)))) {
        return "key_required"
      }
    }
    const result = await this.#db.query(
      `
      INSERT INTO user_package (user_id, package_id)
      SELECT $1, p.id FROM package p WHERE p.type = $2 AND p.name = $3 AND ${AVAILABLE}
      ON CONFLICT (user_id, package_id) DO NOTHING
      RETURNING package_id
      `,
      [userId, type, name]
    )
    if (result.rowCount) return "enabled"
    // Nothing inserted: either it was already on (fine) or it isn't in the catalog.
    const { rows } = await this.#db.query(
      `SELECT 1 FROM package p WHERE p.type = $1 AND p.name = $2 AND ${AVAILABLE}`,
      [type, name]
    )
    return rows.length > 0 ? "enabled" : "not_found"
  }

  /** Turns a selection off, available or not; false when the package doesn't exist at all. */
  async disable(userId: string, type: PackageType, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT id FROM package WHERE type = $1 AND name = $2", [type, name])
    if (!rows[0]) return false
    await this.#db.query("DELETE FROM user_package WHERE user_id = $1 AND package_id = $2", [userId, rows[0].id])
    return true
  }

  /** The user's enabled skills that are still available, with their files. */
  async skillsForUser(userId: string): Promise<CloudSkill[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.name, p.description, p.files
      FROM user_package up JOIN package p ON p.id = up.package_id
      WHERE up.user_id = $1 AND p.type = 'skill' AND ${AVAILABLE}
      ORDER BY p.name
      `,
      [userId]
    )
    return rows.map(row => ({ name: row.name, description: row.description, files: row.files }))
  }

  /** Available skills by name (a widget key's own list); unknown or unavailable names are left out. */
  async skillsByName(names: string[]): Promise<CloudSkill[]> {
    if (names.length === 0) return []
    const { rows } = await this.#db.query(
      `SELECT p.name, p.description, p.files FROM package p WHERE p.type = 'skill' AND p.name = ANY($1) AND ${AVAILABLE} ORDER BY p.name`,
      [names]
    )
    return rows.map(row => ({ name: row.name, description: row.description, files: row.files }))
  }

  /** Names from `names` that aren't available skills, for rejecting a widget config. */
  async unknownSkills(names: string[]): Promise<string[]> {
    const known = new Set((await this.skillsByName(names)).map(skill => skill.name))
    return names.filter(name => !known.has(name))
  }

  /** An available HTTP tool package that can run here, or undefined. */
  async getTool(name: string): Promise<HttpToolPackage | undefined> {
    const { rows } = await this.#db.query(
      `SELECT p.name, p.files FROM package p WHERE p.type = 'tool' AND p.name = $1 AND ${AVAILABLE}`,
      [name]
    )
    return rows[0] ? this.#usableTool(rows[0]) : undefined
  }

  /** The user's enabled HTTP tool packages that can run here, for the agent's Postgres PackageStore. */
  async httpToolsForUser(userId: string): Promise<HttpToolPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.name, p.files
      FROM user_package up JOIN package p ON p.id = up.package_id
      WHERE up.user_id = $1 AND p.type = 'tool' AND ${AVAILABLE}
      ORDER BY p.name
      `,
      [userId]
    )
    return rows.map(row => this.#usableTool(row)).filter(pkg => pkg !== undefined)
  }

  /** The user's package keys by package name, decrypted, for their own turns only. */
  async keysForUser(userId: string): Promise<Map<string, string>> {
    const keys = new Map<string, string>()
    for (const [name, value] of await this.#secrets.getAll(userId, KEY_PREFIX))
      keys.set(name.slice(KEY_PREFIX.length), value)
    return keys
  }

  /**
   * Saves the user's key for an HTTP tool package and tests it with the manifest's `check` request (through
   * `proxy` when set; private hosts are never reached). The key is kept even when the test fails.
   * Throws {@link import("./secret").SecretsUnavailableError} when keys can't be stored.
   */
  async saveKey(userId: string, name: string, apiKey: string, opts: { proxy?: string } = {}): Promise<SaveKeyResult> {
    const pkg = await this.getTool(name)
    if (!pkg) return "not_found"
    if (pkg.auth.type !== "apiKey") return "no_key"
    await this.#secrets.set(userId, packageSecretName(name), apiKey)
    return { check: (await checkHttpToolKey(pkg, apiKey, { proxy: opts.proxy })) ?? null }
  }

  /** Removes the user's key for a tool package; one that can't work without it is turned off too. False when there's no such package. */
  async deleteKey(userId: string, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT id, name, files FROM package WHERE type = 'tool' AND name = $1", [
      name
    ])
    const row = rows[0]
    if (!row) return false
    await this.#secrets.delete(userId, packageSecretName(name))
    const pkg = this.#parseTool(row)
    if (!pkg || keyNeed(pkg) === "required") {
      await this.#db.query("DELETE FROM user_package WHERE user_id = $1 AND package_id = $2", [userId, row.id])
    }
    return true
  }

  #parseTool(row: { name: string; files: Record<string, string> }): HttpToolPackage | undefined {
    try {
      return parseHttpToolManifest(row.files[`${row.name}.toml`] ?? "", row.name)
    } catch (error) {
      warn("Stored HTTP tool doesn't parse; leaving it out", {
        package: row.name,
        error: error instanceof Error ? error.message : error
      })
      return undefined
    }
  }

  /** The stored manifest, unless it no longer parses or requires a key while keys can't be stored. */
  #usableTool(row: { name: string; files: Record<string, string> }): HttpToolPackage | undefined {
    const pkg = this.#parseTool(row)
    if (pkg && keyNeed(pkg) === "required" && !this.#secrets.enabled) return undefined
    return pkg
  }
}
