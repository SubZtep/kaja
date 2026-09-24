import {
  checkHttpToolKey,
  checkMcpAbilityKey,
  createGuardedFetch,
  type KeyCheckResult,
  parseDatasetManifest,
  parseHttpToolManifest,
  parseMcpManifest,
  parsePersonaManifest,
  parseSkillMd
} from "@kaja/nasi"
import type { Dataset, HttpToolAbility, McpAbility, Persona } from "@kaja/schema/abilities"
import {
  type AbilityKeyNeed,
  type AbilityType,
  abilityTypeSchema,
  type CatalogAbility,
  DEFAULT_PERSONA,
  type KeyedAbilityType,
  type SkillDetail,
  type UserAbility
} from "@kaja/schema/api"
import { isPublicHttpUrl } from "@kaja/shared"
import type { Pool } from "pg"
// Built in, so the cloud has its default persona before the first sync brings the same file.
import DEFAULT_PERSONA_TOML from "../../../../marketplace/personas/default.toml" with { type: "text" }
import type { SecretService } from "./secret"

/** An enabled skill with its files, for the agent's Postgres AbilityStore. */
export type CloudSkill = { name: string; description: string; files: Record<string, string> }

export type EnableResult = "enabled" | "not_found" | "key_required"

/** A saved key and its live test (null when the ability has no test), or why it wasn't saved. */
export type SaveKeyResult = { check: KeyCheckResult | null } | "not_found" | "no_key"

/** An ability that can take the user's key, parsed from its stored TOML. */
type KeyedAbility = { type: "tool"; ability: HttpToolAbility } | { type: "mcp"; ability: McpAbility }

type ManifestRow = { type: string; name: string; files: Record<string, string> }

/** Why the cloud can't offer an MCP ability, or undefined when it can: remote only, with a fixed tool list, on a public host. */
export function cloudMcpProblem(ability: McpAbility): string | undefined {
  if (ability.transport === "stdio" || !ability.url) return "stdio servers only run locally"
  if (!ability.tools?.length) return "no `tools` allowlist"
  if (!isPublicHttpUrl(ability.url)) return `${ability.url} isn't a public address`
  return undefined
}

// Offered in the cloud: still in the marketplace, and nothing that needs a shell.
const AVAILABLE = "p.removed_at IS NULL AND NOT p.has_scripts"
const KEY_PREFIX = "ability:"

/** Where an ability's API key lives in `user_secret`. */
function abilitySecretName(name: string): string {
  return `${KEY_PREFIX}${name}`
}

function keyNeed(ability: HttpToolAbility | McpAbility): AbilityKeyNeed {
  if (ability.auth.type !== "apiKey") return "none"
  return ability.auth.optional ? "optional" : "required"
}

/** Parses `ABILITY_KEYS` (`name=key,name=key`) into ability name → key; malformed pairs are skipped. */
export function parseAbilityKeys(value: string | undefined): Map<string, string> {
  const keys = new Map<string, string>()
  for (const pair of (value ?? "").split(",")) {
    const at = pair.indexOf("=")
    const name = pair.slice(0, at).trim()
    const key = pair.slice(at + 1).trim()
    if (at > 0 && name && key) keys.set(name, key)
  }
  return keys
}

/** `default` first: the catalog's own, or the built-in one when the catalog has none. */
function withDefaultFirst(personas: Persona[]): Persona[] {
  const own = personas.find(persona => persona.id === DEFAULT_PERSONA)
  const others = personas.filter(persona => persona.id !== DEFAULT_PERSONA)
  return [own ?? parsePersonaManifest(DEFAULT_PERSONA_TOML, DEFAULT_PERSONA), ...others]
}

export class AbilityService {
  readonly #db: Pool
  readonly #secrets: SecretService
  // TODO: temporary server-wide keys from ABILITY_KEYS, until admin-managed service keys (like providers) replace them.
  readonly #serviceKeys: Map<string, string>

  constructor(db: Pool, secrets: SecretService, serviceKeys = new Map<string, string>()) {
    this.#db = db
    this.#secrets = secrets
    this.#serviceKeys = serviceKeys
  }

  /** Whether users' keys can be stored (USER_SECRET_KEY is set); without it, abilities that require a key are left out everywhere. */
  get keysEnabled(): boolean {
    return this.#secrets.enabled
  }

  /** What users can enable: available skills, personas (not `default`, which everyone always has), HTTP tools and MCP servers, by type and name. */
  async listCatalog(): Promise<CatalogAbility[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, p.updated_at, CASE WHEN p.type <> 'skill' THEN p.files END AS files
      FROM ability p WHERE ${AVAILABLE} AND p.type = ANY($1) ORDER BY p.type, p.name
      `,
      // Datasets come with the personas that use them; they're never listed or toggled.
      [abilityTypeSchema.options]
    )
    const catalog: CatalogAbility[] = []
    for (const row of rows) {
      const details = this.#catalogDetails(row)
      if (!details) continue
      catalog.push({
        type: row.type,
        name: row.name,
        description: row.description,
        updatedAt: new Date(row.updated_at),
        ...details
      })
    }
    return catalog
  }

  /** One available skill in full (instructions and file names), or null when it isn't in the catalog. */
  async getSkill(name: string): Promise<SkillDetail | null> {
    const { rows } = await this.#db.query(
      `SELECT p.name, p.description, p.files, p.updated_at FROM ability p WHERE p.type = 'skill' AND p.name = $1 AND ${AVAILABLE}`,
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
  async listForUser(userId: string): Promise<UserAbility[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.description, up.enabled_at, (${AVAILABLE}) AS available,
        CASE WHEN p.type <> 'skill' THEN p.files END AS files
      FROM user_ability up JOIN ability p ON p.id = up.ability_id
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

  /** Abilities the user saved a key for, on or off. */
  async keyNames(userId: string): Promise<string[]> {
    return [...(await this.#secrets.names(userId, KEY_PREFIX))]
      .map(name => name.slice(KEY_PREFIX.length))
      .sort((a, b) => a.localeCompare(b))
  }

  /** Enables an available ability for the user. Enabling twice is fine; a tool or MCP server that requires a key needs one saved first. */
  async enable(userId: string, type: AbilityType, name: string): Promise<EnableResult> {
    if (type === "tool" || type === "mcp") {
      const keyed = await this.#getKeyed(type, name)
      if (!keyed) return "not_found"
      if (this.#keyNeed(keyed.ability) === "required" && !(await this.#secrets.has(userId, abilitySecretName(name)))) {
        return "key_required"
      }
    }
    const result = await this.#db.query(
      `
      INSERT INTO user_ability (user_id, ability_id)
      SELECT $1, p.id FROM ability p WHERE p.type = $2 AND p.name = $3 AND ${AVAILABLE}
      ON CONFLICT (user_id, ability_id) DO NOTHING
      RETURNING ability_id
      `,
      [userId, type, name]
    )
    if (result.rowCount) return "enabled"
    // Nothing inserted: either it was already on (fine) or it isn't in the catalog.
    const { rows } = await this.#db.query(
      `SELECT 1 FROM ability p WHERE p.type = $1 AND p.name = $2 AND ${AVAILABLE}`,
      [type, name]
    )
    return rows.length > 0 ? "enabled" : "not_found"
  }

  /** Turns a selection off, available or not; false when the ability doesn't exist at all. */
  async disable(userId: string, type: AbilityType, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT id FROM ability WHERE type = $1 AND name = $2", [type, name])
    if (!rows[0]) return false
    await this.#db.query("DELETE FROM user_ability WHERE user_id = $1 AND ability_id = $2", [userId, rows[0].id])
    return true
  }

  /** The user's enabled skills that are still available, with their files. */
  async skillsForUser(userId: string): Promise<CloudSkill[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.name, p.description, p.files
      FROM user_ability up JOIN ability p ON p.id = up.ability_id
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
      `SELECT p.name, p.description, p.files FROM ability p WHERE p.type = 'skill' AND p.name = ANY($1) AND ${AVAILABLE} ORDER BY p.name`,
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
      `SELECT p.type, p.name, p.files FROM ability p WHERE p.type = 'persona' AND ${AVAILABLE} ORDER BY p.name`
    )
    return withDefaultFirst(rows.map(row => this.#parsePersona(row)).filter(persona => persona !== undefined))
  }

  /** The user's roster: `default` first, then the personas they enabled that are still available. */
  async personasForUser(userId: string): Promise<Persona[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.files FROM ability p
      WHERE p.type = 'persona' AND ${AVAILABLE}
        AND (p.name = $2 OR EXISTS (SELECT 1 FROM user_ability up WHERE up.ability_id = p.id AND up.user_id = $1))
      ORDER BY p.name
      `,
      [userId, DEFAULT_PERSONA]
    )
    return withDefaultFirst(rows.map(row => this.#parsePersona(row)).filter(persona => persona !== undefined))
  }

  /** Every dataset in the marketplace by topic, for nasi's dataset loaders; one that no longer parses is left out with a warning. */
  async datasets(): Promise<Map<string, Dataset>> {
    const { rows } = await this.#db.query(
      `SELECT p.name, p.files FROM ability p WHERE p.type = 'dataset' AND ${AVAILABLE} ORDER BY p.name`
    )
    const datasets = new Map<string, Dataset>()
    for (const row of rows) {
      try {
        datasets.set(row.name, parseDatasetManifest(row.files[`${row.name}.json`] ?? ""))
      } catch (error) {
        console.warn("Stored dataset can't be used; leaving it out", {
          dataset: row.name,
          error: error instanceof Error ? error.message : error
        })
      }
    }
    return datasets
  }

  /** The user's enabled HTTP tool abilities that can run here, for the agent's Postgres AbilityStore. */
  async httpToolsForUser(userId: string): Promise<HttpToolAbility[]> {
    return (await this.#keyedForUser(userId, "tool")).flatMap(keyed => (keyed.type === "tool" ? [keyed.ability] : []))
  }

  /** The user's enabled MCP server abilities that can run here, for the agent's Postgres AbilityStore. */
  async mcpForUser(userId: string): Promise<McpAbility[]> {
    return (await this.#keyedForUser(userId, "mcp")).flatMap(keyed => (keyed.type === "mcp" ? [keyed.ability] : []))
  }

  /** The user's ability keys by ability name, decrypted, for their own turns only. */
  async keysForUser(userId: string): Promise<Map<string, string>> {
    // Server-wide keys first, so the user's own key replaces one.
    const keys = new Map(this.#serviceKeys)
    for (const [name, value] of await this.#secrets.getAll(userId, KEY_PREFIX))
      keys.set(name.slice(KEY_PREFIX.length), value)
    return keys
  }

  /**
   * Saves the user's key for an HTTP tool or MCP ability and tests it: the tool's `check` request, or
   * connecting to the MCP server and listing its tools. Tests go through `proxy` when set and never reach a
   * private host. The key is kept even when the test fails.
   * Throws {@link import("./secret").SecretsUnavailableError} when keys can't be stored.
   */
  async saveKey(
    userId: string,
    type: KeyedAbilityType,
    name: string,
    apiKey: string,
    opts: { proxy?: string } = {}
  ): Promise<SaveKeyResult> {
    const keyed = await this.#getKeyed(type, name)
    if (!keyed) return "not_found"
    if (keyed.ability.auth.type !== "apiKey") return "no_key"
    await this.#secrets.set(userId, abilitySecretName(name), apiKey)
    const check =
      keyed.type === "tool"
        ? await checkHttpToolKey(keyed.ability, apiKey, { proxy: opts.proxy })
        : await checkMcpAbilityKey(keyed.ability, apiKey, { fetch: createGuardedFetch({ proxy: opts.proxy }) })
    return { check: check ?? null }
  }

  /** Removes the user's key for a tool or MCP ability; one that can't work without it is turned off too. False when there's no such ability. */
  async deleteKey(userId: string, type: KeyedAbilityType, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT id, type, name, files FROM ability WHERE type = $1 AND name = $2", [
      type,
      name
    ])
    const row = rows[0]
    if (!row) return false
    await this.#secrets.delete(userId, abilitySecretName(name))
    const keyed = this.#parse(row)
    if (!keyed || this.#keyNeed(keyed.ability) === "required") {
      await this.#db.query("DELETE FROM user_ability WHERE user_id = $1 AND ability_id = $2", [userId, row.id])
    }
    return true
  }

  /** An available tool or MCP ability that can run here, or undefined. */
  async #getKeyed(type: KeyedAbilityType, name: string): Promise<KeyedAbility | undefined> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.files FROM ability p WHERE p.type = $1 AND p.name = $2 AND ${AVAILABLE}`,
      [type, name]
    )
    return rows[0] ? this.#usable(rows[0]) : undefined
  }

  async #keyedForUser(userId: string, type: KeyedAbilityType): Promise<KeyedAbility[]> {
    const { rows } = await this.#db.query(
      `
      SELECT p.type, p.name, p.files
      FROM user_ability up JOIN ability p ON p.id = up.ability_id
      WHERE up.user_id = $1 AND p.type = $2 AND ${AVAILABLE}
      ORDER BY p.name
      `,
      [userId, type]
    )
    return rows.map(row => this.#usable(row)).filter(keyed => keyed !== undefined)
  }

  /** The stored manifest, parsed; undefined (with a warning) when it no longer parses or the cloud can't run it. */
  #parse(row: ManifestRow): KeyedAbility | undefined {
    try {
      const text = row.files[`${row.name}.toml`] ?? ""
      if (row.type === "tool") return { type: "tool", ability: parseHttpToolManifest(text, row.name) }
      const ability = parseMcpManifest(text, row.name)
      const problem = cloudMcpProblem(ability)
      if (problem) throw new Error(problem)
      return { type: "mcp", ability }
    } catch (error) {
      console.warn("Stored ability can't be used; leaving it out", {
        type: row.type,
        ability: row.name,
        error: error instanceof Error ? error.message : error
      })
      return undefined
    }
  }

  // A catalog entry's type-specific part, or null when the row can't be offered (unparsable, `default`, or unusable).
  #catalogDetails(row: ManifestRow): Pick<CatalogAbility, "persona" | "http" | "mcp"> | null {
    if (row.type === "skill") return {}
    if (row.type === "persona") {
      const persona = row.name === DEFAULT_PERSONA ? undefined : this.#parsePersona(row)
      return persona
        ? { persona: { label: persona.label, when: persona.when, instructions: persona.instructions } }
        : null
    }
    const keyed = this.#usable(row)
    if (!keyed) return null
    if (keyed.type === "tool") {
      return {
        http: {
          domain: new URL(keyed.ability.baseUrl).host,
          key: this.#keyNeed(keyed.ability),
          tools: keyed.ability.tools.map(tool => ({
            name: tool.name,
            method: tool.method,
            description: tool.description
          }))
        }
      }
    }
    return {
      mcp: {
        domain: new URL(keyed.ability.url!).host,
        key: this.#keyNeed(keyed.ability),
        transport: keyed.ability.transport === "sse" ? "sse" : "http",
        approval: keyed.ability.approval,
        tools: keyed.ability.tools ?? []
      }
    }
  }

  /** A stored persona, parsed; undefined (with a warning) when it no longer parses. */
  #parsePersona(row: ManifestRow): Persona | undefined {
    try {
      return parsePersonaManifest(row.files[`${row.name}.toml`] ?? "", row.name)
    } catch (error) {
      console.warn("Stored persona can't be used; leaving it out", {
        persona: row.name,
        error: error instanceof Error ? error.message : error
      })
      return undefined
    }
  }

  /** Whether an available ability can actually run here: its stored manifest still parses (and a keyed one can get its key). */
  #runs(row: ManifestRow): boolean {
    if (row.type === "skill") return true
    if (row.type === "persona") return this.#parsePersona(row) !== undefined
    return this.#usable(row) !== undefined
  }

  /** An ability's key need, where a server-wide key turns a required one optional: the user may still bring their own. */
  #keyNeed(ability: HttpToolAbility | McpAbility): AbilityKeyNeed {
    const need = keyNeed(ability)
    return need === "required" && this.#serviceKeys.has(ability.name) ? "optional" : need
  }

  /** {@link #parse}, but also undefined when it requires a key while keys can't be stored. */
  #usable(row: ManifestRow): KeyedAbility | undefined {
    const keyed = this.#parse(row)
    if (keyed && this.#keyNeed(keyed.ability) === "required" && !this.#secrets.enabled) return undefined
    return keyed
  }
}
