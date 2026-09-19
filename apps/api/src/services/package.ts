import { parseSkillMd } from "@kaja/nasi"
import type { CatalogPackage, PackageType, SkillDetail, UserPackage } from "@kaja/schema/api"
import type { Pool } from "pg"

/** An enabled skill with its files, for the agent's Postgres PackageStore. */
export type CloudSkill = { name: string; description: string; files: Record<string, string> }

// Offered in the cloud: still in the marketplace, and nothing that needs a shell.
const AVAILABLE = "p.removed_at IS NULL AND NOT p.has_scripts"

export class PackageService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** What users can enable: available skills, by name. */
  async listCatalog(): Promise<CatalogPackage[]> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.description, p.updated_at FROM package p WHERE ${AVAILABLE} ORDER BY p.type, p.name`
    )
    return rows.map(row => this.#rowToCatalog(row))
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

  /** The user's selections, including ones that left the marketplace (`available: false`). */
  async listForUser(userId: string): Promise<UserPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, up.enabled_at, (${AVAILABLE}) AS available
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
      available: row.available
    }))
  }

  /** Enables an available package for the user; false when there's no such package in the catalog. Enabling twice is fine. */
  async enable(userId: string, type: PackageType, name: string): Promise<boolean> {
    const result = await this.#db.query(
      `
      INSERT INTO user_package (user_id, package_id)
      SELECT $1, p.id FROM package p WHERE p.type = $2 AND p.name = $3 AND ${AVAILABLE}
      ON CONFLICT (user_id, package_id) DO NOTHING
      RETURNING package_id
      `,
      [userId, type, name]
    )
    if (result.rowCount) return true
    // Nothing inserted: either it was already on (fine) or it isn't in the catalog.
    const { rows } = await this.#db.query(
      `SELECT 1 FROM package p WHERE p.type = $1 AND p.name = $2 AND ${AVAILABLE}`,
      [type, name]
    )
    return rows.length > 0
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

  #rowToCatalog(row: any): CatalogPackage {
    return { type: row.type, name: row.name, description: row.description, updatedAt: new Date(row.updated_at) }
  }
}
