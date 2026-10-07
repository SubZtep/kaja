import {
  checkHttpToolKey,
  checkMcpAbilityKey,
  createGuardedFetch,
  type KeyCheckResult,
  parseDatasetManifest,
  parseHttpToolManifest,
  parseMcpManifest,
  parsePersonaManifest,
  personaAbilities
} from "@kaja/nasi"
import type { Dataset, HttpToolAbility, McpAbility, Persona } from "@kaja/schema/abilities"
import { type AbilityKey, type AbilityKeyNeed, DEFAULT_PERSONA } from "@kaja/schema/api"
import { isPublicHttpUrl } from "@kaja/shared/net"
import type { Pool } from "pg"
// Built in, so the cloud has its default persona before the first sync brings the same file.
import DEFAULT_PERSONA_TOML from "../../../../marketplace/personas/default.toml" with { type: "text" }
import type { SecretService } from "./secret"

/** An available skill with its files, for the agent's Postgres AbilityStore. */
export type CloudSkill = { name: string; description: string; files: Record<string, string> }

/** A saved key and its live test (null when the ability has no test), or why it wasn't saved. */
export type SaveKeyResult = { check: KeyCheckResult | null } | "not_found" | "no_key"

/** An ability that can take the user's key, parsed from its stored TOML. */
type KeyedAbility = { type: "tool"; ability: HttpToolAbility } | { type: "mcp"; ability: McpAbility }

type ManifestRow = { type: string; name: string; description?: string; files: Record<string, string> }

/**
 * Why the cloud can't offer an MCP ability, or undefined when it can: a fixed tool list, and either a remote server on a
 * public host or a stdio one an MCP sandbox runs (not one that takes a key: keys aren't forwarded there yet).
 */
export function cloudMcpProblem(ability: McpAbility): string | undefined {
  if (!ability.tools?.length) return "no `tools` allowlist"
  if (ability.transport === "stdio" || !ability.url) {
    // Also keeps saveKey's live test from starting the command on this host.
    if (ability.auth.type === "apiKey") return "the MCP sandbox can't take a key yet"
    return undefined
  }
  if (!isPublicHttpUrl(ability.url)) return `${ability.url} isn't a public address`
  return undefined
}

/** What a stdio ability's catalog entry names as where its calls go: whichever MCP sandbox the user's turn runs in. */
export const SANDBOX_DOMAIN = "sandbox"

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

/** Where an ability's calls go: its HTTP tool's or remote server's host, or the MCP sandbox for a stdio one. */
function domainOf(keyed: KeyedAbility): string {
  if (keyed.type === "tool") return new URL(keyed.ability.baseUrl).host
  return keyed.ability.url ? new URL(keyed.ability.url).host : SANDBOX_DOMAIN
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

  /**
   * The abilities that take a key and some persona uses, one entry per ability, with whether the user saved one: the
   * Profile page's API keys list. An ability with a server-wide key counts as optional.
   */
  async listKeys(userId: string): Promise<AbilityKey[]> {
    const used = new Set((await this.personaCatalog()).flatMap(persona => [...personaAbilities(persona).keys()]))
    const saved = new Set(await this.keyNames(userId))
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.description, p.files FROM ability p WHERE ${AVAILABLE} AND p.type IN ('tool', 'mcp') ORDER BY p.name, p.type`
    )
    const keys = new Map<string, AbilityKey>()
    for (const row of rows) {
      const keyed = used.has(row.name) && !keys.has(row.name) ? this.#usable(row) : undefined
      const need = keyed && this.#keyNeed(keyed.ability)
      if (!(keyed && need && need !== "none")) continue
      keys.set(row.name, {
        name: row.name,
        description: row.description,
        key: need,
        domain: domainOf(keyed),
        saved: saved.has(row.name)
      })
    }
    return [...keys.values()]
  }

  /** Abilities the user saved a key for. */
  async keyNames(userId: string): Promise<string[]> {
    return [...(await this.#secrets.names(userId, KEY_PREFIX))]
      .map(name => name.slice(KEY_PREFIX.length))
      .sort((a, b) => a.localeCompare(b))
  }

  /** Every available skill, with its files: a persona's `abilities` decides which of them a turn uses. */
  async skills(): Promise<CloudSkill[]> {
    const { rows } = await this.#db.query(
      `SELECT p.name, p.description, p.files FROM ability p WHERE p.type = 'skill' AND ${AVAILABLE} ORDER BY p.name`
    )
    return rows.map(row => ({ name: row.name, description: row.description, files: row.files }))
  }

  /** Every persona in the catalog, `default` first (the built-in one until a sync brings it): every user's roster. */
  async personaCatalog(): Promise<Persona[]> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.files FROM ability p WHERE p.type = 'persona' AND ${AVAILABLE} ORDER BY p.name`
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

  /** Every HTTP tool ability that can run here, for the agent's Postgres AbilityStore. */
  async httpTools(): Promise<HttpToolAbility[]> {
    return (await this.#keyedOfType("tool")).flatMap(keyed => (keyed.type === "tool" ? [keyed.ability] : []))
  }

  /** Every MCP server ability that can run here, for the agent's Postgres AbilityStore. */
  async mcpAbilities(): Promise<McpAbility[]> {
    return (await this.#keyedOfType("mcp")).flatMap(keyed => (keyed.type === "mcp" ? [keyed.ability] : []))
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
   * Saves the user's key for an ability and tests it: its HTTP tool's `check` request, or connecting to its MCP
   * server and listing the tools. Tests go through `proxy` when set and never reach a private host. The key is kept
   * even when the test fails. Throws {@link import("./secret").SecretsUnavailableError} when keys can't be stored.
   */
  async saveKey(userId: string, name: string, apiKey: string, opts: { proxy?: string } = {}): Promise<SaveKeyResult> {
    const keyed = await this.#keyedByName(name)
    if (!keyed) return "not_found"
    if (keyed.ability.auth.type !== "apiKey") return "no_key"
    await this.#secrets.set(userId, abilitySecretName(name), apiKey)
    const check =
      keyed.type === "tool"
        ? await checkHttpToolKey(keyed.ability, apiKey, { proxy: opts.proxy })
        : await checkMcpAbilityKey(keyed.ability, apiKey, { fetch: createGuardedFetch({ proxy: opts.proxy }) })
    return { check: check ?? null }
  }

  /** Removes the user's key for an ability; false when there's no such ability. */
  async deleteKey(userId: string, name: string): Promise<boolean> {
    const { rows } = await this.#db.query("SELECT 1 FROM ability WHERE type IN ('tool', 'mcp') AND name = $1", [name])
    if (!rows[0]) return false
    await this.#secrets.delete(userId, abilitySecretName(name))
    return true
  }

  /** The ability's part that takes a key (its HTTP tool before its MCP server), else its first usable part; undefined when it has none here. */
  async #keyedByName(name: string): Promise<KeyedAbility | undefined> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.files FROM ability p WHERE p.type IN ('tool', 'mcp') AND p.name = $1 AND ${AVAILABLE} ORDER BY p.type DESC`,
      [name]
    )
    const parts = rows.flatMap(row => this.#usable(row) ?? [])
    return parts.find(part => part.ability.auth.type === "apiKey") ?? parts[0]
  }

  async #keyedOfType(type: "tool" | "mcp"): Promise<KeyedAbility[]> {
    const { rows } = await this.#db.query(
      `SELECT p.type, p.name, p.files FROM ability p WHERE p.type = $1 AND ${AVAILABLE} ORDER BY p.name`,
      [type]
    )
    return rows.flatMap(row => this.#usable(row) ?? [])
  }

  /** The stored manifest, parsed; undefined (with a warning) when it no longer parses or the cloud can't run it. */
  #parse(row: ManifestRow): KeyedAbility | undefined {
    try {
      const text = row.files[row.type === "tool" ? "tool.toml" : "mcp.toml"] ?? ""
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
