import { warn } from "@kaja/logger"
import {
  checkHttpToolKey,
  checkMcpPackageKey,
  createGuardedFetch,
  type KeyCheckResult,
  parseDatasetManifest,
  parseHttpToolManifest,
  parseMcpManifest,
  parsePersonaManifest,
  parseSkillMd
} from "@kaja/nasi"
import {
  type CatalogPackage,
  DEFAULT_PERSONA,
  type KeyedPackageType,
  type PackageKeyNeed,
  type PackageType,
  packageTypeSchema,
  type SkillDetail,
  type UserPackage
} from "@kaja/schema/api"
import type { Dataset, HttpToolPackage, McpPackage, Persona } from "@kaja/schema/packages"
import { isPublicHttpUrl } from "@kaja/shared"
import type { Pool } from "pg"
// Built in, so the cloud has its default persona before the first sync brings the same file.
import DEFAULT_PERSONA_TOML from "../../../../marketplace/personas/default.toml" with { type: "text" }
import type { SecretService } from "./secret"

/** An enabled skill with its files, for the agent's Postgres PackageStore. */
export type CloudSkill = { name: string; description: string; files: Record<string, string> }

export type EnableResult = "enabled" | "not_found" | "key_required"

/** A saved key and its live test (null when the package has no test), or why it wasn't saved. */
export type SaveKeyResult = { check: KeyCheckResult | null } | "not_found" | "no_key"

/** A package that can take the user's key, parsed from its stored TOML. */
type KeyedPackage = { type: "tool"; pkg: HttpToolPackage } | { type: "mcp"; pkg: McpPackage }

type ManifestRow = { type: string; name: string; files: Record<string, string> }

/** Why the cloud can't offer an MCP package, or undefined when it can: remote only, with a fixed tool list, on a public host. */
export function cloudMcpProblem(pkg: McpPackage): string | undefined {
  if (pkg.transport === "stdio" || !pkg.url) return "stdio servers only run locally"
  if (!pkg.tools?.length) return "no `tools` allowlist"
  if (!isPublicHttpUrl(pkg.url)) return `${pkg.url} isn't a public address`
  return undefined
}

// Offered in the cloud: still in the marketplace, and nothing that needs a shell.
const AVAILABLE = "p.removed_at IS NULL AND NOT p.has_scripts"
const KEY_PREFIX = "package:"

/** Where a package's API key lives in `user_secret`. */
export function packageSecretName(name: string): string {
  return `${KEY_PREFIX}${name}`
}

function keyNeed(pkg: HttpToolPackage | McpPackage): PackageKeyNeed {
  if (pkg.auth.type !== "apiKey") return "none"
  return pkg.auth.optional ? "optional" : "required"
}

/** `default` first: the catalog's own, or the built-in one when the catalog has none. */
function withDefaultFirst(personas: Persona[]): Persona[] {
  const own = personas.find(persona => persona.id === DEFAULT_PERSONA)
  const others = personas.filter(persona => persona.id !== DEFAULT_PERSONA)
  return [own ?? parsePersonaManifest(DEFAULT_PERSONA_TOML, DEFAULT_PERSONA), ...others]
}

export class PackageService {
  readonly #db: Pool
  readonly #secrets: SecretService

  constructor(db: Pool, secrets: SecretService) {
    this.#db = db
    this.#secrets = secrets
  }

  /** Whether users' keys can be stored (USER_SECRET_KEY is set); without it, packages that require a key are left out everywhere. */
  get keysEnabled(): boolean {
    return this.#secrets.enabled
  }

  /** What users can enable: available skills, personas (not `default`, which everyone always has), HTTP tools and MCP servers, by type and name. */
  async listCatalog(): Promise<CatalogPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, p.updated_at, CASE WHEN p.type <> 'skill' THEN p.files END AS files
      FROM package p WHERE ${AVAILABLE} AND p.type = ANY($1) ORDER BY p.type, p.name
      `,
      // Datasets come with the personas that use them; they're never listed or toggled.
      [packageTypeSchema.options]
    )
    const catalog: CatalogPackage[] = []
    for (const row of rows) {
      const entry: CatalogPackage = {
        type: row.type,
        name: row.name,
        description: row.description,
        updatedAt: new Date(row.updated_at)
      }
      if (row.type === "persona") {
        const persona = row.name === DEFAULT_PERSONA ? undefined : this.#parsePersona(row)
        if (!persona) continue
        entry.persona = { label: persona.label, when: persona.when, instructions: persona.instructions }
      } else if (row.type !== "skill") {
        const keyed = this.#usable(row)
        if (!keyed) continue
        if (keyed.type === "tool") {
          entry.http = {
            domain: new URL(keyed.pkg.baseUrl).host,
            key: keyNeed(keyed.pkg),
            tools: keyed.pkg.tools.map(tool => ({
              name: tool.name,
              method: tool.method,
              description: tool.description
            }))
          }
        } else {
          entry.mcp = {
            domain: new URL(keyed.pkg.url!).host,
            key: keyNeed(keyed.pkg),
            transport: keyed.pkg.transport === "sse" ? "sse" : "http",
            approval: keyed.pkg.approval,
            tools: keyed.pkg.tools ?? []
          }
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
        .sort((a, b) => a.localeCompare(b)),
      updatedAt: new Date(row.updated_at)
    }
  }

  /** The user's selections, including ones that left the marketplace or can't run here (`available: false`). */
  async listForUser(userId: string): Promise<UserPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, up.enabled_at, (${AVAILABLE}) AS available,
        CASE WHEN p.type <> 'skill' THEN p.files END AS files
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
      available: row.available && this.#runs(row)
    }))
  }

  /** Packages the user saved a key for, on or off. */
  async keyNames(userId: string): Promise<string[]> {
    return [...(await this.#secrets.names(userId, KEY_PREFIX))]
      .map(name => name.slice(KEY_PREFIX.length))
      .sort((a, b) => a.localeCompare(b))
  }

  /** Enables an available package for the user. Enabling twice is fine; a tool or MCP server that requires a key needs one saved first. */
  async enable(userId: string, type: PackageType, name: string): Promise<EnableResult> {
    if (type === "tool" || type === "mcp") {
      const keyed = await this.#getKeyed(type, name)
      if (!keyed) return "not_found"
      if (keyNeed(keyed.pkg) === "required" && !(await this.#secrets.has(userId, packageSecretName(name)))) {
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

  /** Every persona in the catalog, `default` first (the built-in one until a sync brings it). */
  async personaCatalog(): Promise<Persona[]> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.files FROM package p WHERE p.type = 'persona' AND ${AVAILABLE} ORDER BY p.name`
    )
    return withDefaultFirst(rows.map(row => this.#parsePersona(row)).filter(persona => persona !== undefined))
  }

  /** The user's roster: `default` first, then the personas they enabled that are still available. */
  async personasForUser(userId: string): Promise<Persona[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.files FROM package p
      WHERE p.type = 'persona' AND ${AVAILABLE}
        AND (p.name = $2 OR EXISTS (SELECT 1 FROM user_package up WHERE up.package_id = p.id AND up.user_id = $1))
      ORDER BY p.name
      `,
      [userId, DEFAULT_PERSONA]
    )
    return withDefaultFirst(rows.map(row => this.#parsePersona(row)).filter(persona => persona !== undefined))
  }

  /** Every dataset in the marketplace by topic, for nasi's dataset loaders; one that no longer parses is left out with a warning. */
  async datasets(): Promise<Map<string, Dataset>> {
    const { rows } = await this.#db.query(
      `SELECT p.name, p.files FROM package p WHERE p.type = 'dataset' AND ${AVAILABLE} ORDER BY p.name`
    )
    const datasets = new Map<string, Dataset>()
    for (const row of rows) {
      try {
        datasets.set(row.name, parseDatasetManifest(row.files[`${row.name}.json`] ?? ""))
      } catch (error) {
        warn("Stored dataset can't be used; leaving it out", {
          dataset: row.name,
          error: error instanceof Error ? error.message : error
        })
      }
    }
    return datasets
  }

  /** The user's enabled HTTP tool packages that can run here, for the agent's Postgres PackageStore. */
  async httpToolsForUser(userId: string): Promise<HttpToolPackage[]> {
    return (await this.#keyedForUser(userId, "tool")).flatMap(keyed => (keyed.type === "tool" ? [keyed.pkg] : []))
  }

  /** The user's enabled MCP server packages that can run here, for the agent's Postgres PackageStore. */
  async mcpForUser(userId: string): Promise<McpPackage[]> {
    return (await this.#keyedForUser(userId, "mcp")).flatMap(keyed => (keyed.type === "mcp" ? [keyed.pkg] : []))
  }

  /** The user's package keys by package name, decrypted, for their own turns only. */
  async keysForUser(userId: string): Promise<Map<string, string>> {
    const keys = new Map<string, string>()
    for (const [name, value] of await this.#secrets.getAll(userId, KEY_PREFIX))
      keys.set(name.slice(KEY_PREFIX.length), value)
    return keys
  }

  /**
   * Saves the user's key for an HTTP tool or MCP package and tests it: the tool's `check` request, or
   * connecting to the MCP server and listing its tools. Tests go through `proxy` when set and never reach a
   * private host. The key is kept even when the test fails.
   * Throws {@link import("./secret").SecretsUnavailableError} when keys can't be stored.
   */
  async saveKey(
    userId: string,
    type: KeyedPackageType,
    name: string,
    apiKey: string,
    opts: { proxy?: string } = {}
  ): Promise<SaveKeyResult> {
    const keyed = await this.#getKeyed(type, name)
    if (!keyed) return "not_found"
    if (keyed.pkg.auth.type !== "apiKey") return "no_key"
    await this.#secrets.set(userId, packageSecretName(name), apiKey)
    const check =
      keyed.type === "tool"
        ? await checkHttpToolKey(keyed.pkg, apiKey, { proxy: opts.proxy })
        : await checkMcpPackageKey(keyed.pkg, apiKey, { fetch: createGuardedFetch({ proxy: opts.proxy }) })
    return { check: check ?? null }
  }

  /** Removes the user's key for a tool or MCP package; one that can't work without it is turned off too. False when there's no such package. */
  async deleteKey(userId: string, type: KeyedPackageType, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT id, type, name, files FROM package WHERE type = $1 AND name = $2", [
      type,
      name
    ])
    const row = rows[0]
    if (!row) return false
    await this.#secrets.delete(userId, packageSecretName(name))
    const keyed = this.#parse(row)
    if (!keyed || keyNeed(keyed.pkg) === "required") {
      await this.#db.query("DELETE FROM user_package WHERE user_id = $1 AND package_id = $2", [userId, row.id])
    }
    return true
  }

  /** An available tool or MCP package that can run here, or undefined. */
  async #getKeyed(type: KeyedPackageType, name: string): Promise<KeyedPackage | undefined> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.files FROM package p WHERE p.type = $1 AND p.name = $2 AND ${AVAILABLE}`,
      [type, name]
    )
    return rows[0] ? this.#usable(rows[0]) : undefined
  }

  async #keyedForUser(userId: string, type: KeyedPackageType): Promise<KeyedPackage[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.files
      FROM user_package up JOIN package p ON p.id = up.package_id
      WHERE up.user_id = $1 AND p.type = $2 AND ${AVAILABLE}
      ORDER BY p.name
      `,
      [userId, type]
    )
    return rows.map(row => this.#usable(row)).filter(keyed => keyed !== undefined)
  }

  /** The stored manifest, parsed; undefined (with a warning) when it no longer parses or the cloud can't run it. */
  #parse(row: ManifestRow): KeyedPackage | undefined {
    try {
      const text = row.files[`${row.name}.toml`] ?? ""
      if (row.type === "tool") return { type: "tool", pkg: parseHttpToolManifest(text, row.name) }
      const pkg = parseMcpManifest(text, row.name)
      const problem = cloudMcpProblem(pkg)
      if (problem) throw new Error(problem)
      return { type: "mcp", pkg }
    } catch (error) {
      warn("Stored package can't be used; leaving it out", {
        type: row.type,
        package: row.name,
        error: error instanceof Error ? error.message : error
      })
      return undefined
    }
  }

  /** A stored persona, parsed; undefined (with a warning) when it no longer parses. */
  #parsePersona(row: ManifestRow): Persona | undefined {
    try {
      return parsePersonaManifest(row.files[`${row.name}.toml`] ?? "", row.name)
    } catch (error) {
      warn("Stored persona can't be used; leaving it out", {
        persona: row.name,
        error: error instanceof Error ? error.message : error
      })
      return undefined
    }
  }

  /** Whether an available package can actually run here: its stored manifest still parses (and a keyed one can get its key). */
  #runs(row: ManifestRow): boolean {
    if (row.type === "skill") return true
    if (row.type === "persona") return this.#parsePersona(row) !== undefined
    return this.#usable(row) !== undefined
  }

  /** {@link #parse}, but also undefined when it requires a key while keys can't be stored. */
  #usable(row: ManifestRow): KeyedPackage | undefined {
    const keyed = this.#parse(row)
    if (keyed && keyNeed(keyed.pkg) === "required" && !this.#secrets.enabled) return undefined
    return keyed
  }
}
