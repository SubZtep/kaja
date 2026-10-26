import {
  checkHttpToolKey,
  checkMcpAbilityKey,
  createGuardedFetch,
  type FetchLike,
  type KeyCheckResult,
  type McpSandbox,
  parseDatasetManifest,
  parseHttpToolManifest,
  parseMcpManifest,
  parsePersonaManifest,
  parseSkillMd
} from "@kaja/nasi"
import type { Dataset, HttpToolAbility, McpAbility, Persona } from "@kaja/schema/abilities"
import { type AbilityKey, type AbilityKeyNeed, DEFAULT_PERSONA } from "@kaja/schema/api"
import { isPublicHttpUrl } from "@kaja/shared/net"
import type { SQL } from "bun"
// Built in, so the cloud has its default persona before the first sync brings the same file.
import DEFAULT_PERSONA_TOML from "../../../../marketplace/personas/default.toml" with { type: "text" }
import type { SecretService } from "./secret"

/** An available skill with its files, for the agent's Postgres AbilityStore. */
/** A stored skill with its files; `sticky` is its SKILL.md's suggestion to keep it in the system prompt. */
export type CloudSkill = { name: string; description: string; files: Record<string, string>; sticky?: boolean }

/** A saved key and its live test (null when the ability has no test), or why it wasn't saved. */
export type SaveKeyResult = { check: KeyCheckResult | null } | "not_found" | "no_key"

/** An ability that can take a key, parsed from its stored TOML. */
type KeyedAbility = { type: "tool"; ability: HttpToolAbility } | { type: "mcp"; ability: McpAbility }

type ManifestRow = { type: string; name: string; description?: string; files: Record<string, string> }

/**
 * Why the cloud can't offer an MCP ability, or undefined when it can: a fixed tool list, and either a remote server on
 * a public host or a stdio one an MCP sandbox runs (a key comes with each request), and not local-only.
 */
export function cloudMcpProblem(ability: McpAbility): string | undefined {
  if (!ability.tools?.length) return "no `tools` allowlist"
  if (ability.localOnly || ability.roots) return "it only runs on the user's own machine"
  if (ability.transport === "stdio" || !ability.url) {
    // Also keeps saveKey's live test from starting the command on this host.
    return undefined
  }
  if (!isPublicHttpUrl(ability.url)) return `${ability.url} isn't a public address`
  return undefined
}

/** What a stdio ability's catalog entry names as where its calls go: whichever MCP sandbox the user's turn runs in. */
const SANDBOX_DOMAIN = "sandbox"

const KEY_PREFIX = "ability:"

/**
 * An ability key a call carries: `own` when it's the user's (a local client's, through the relay), else the server-wide
 * one (which only the official sandbox may see).
 */
export type AbilityKeyValue = { value: string; own: boolean }

/** Where an ability's API key lives in `service_secret`. */
function abilitySecretName(name: string): string {
  return `${KEY_PREFIX}${name}`
}

function keyNeed(ability: HttpToolAbility | McpAbility): AbilityKeyNeed {
  if (ability.auth.type !== "apiKey") return "none"
  return ability.auth.keyless ? "optional" : "required"
}

/** `default` first: the catalog's own, or the built-in one when the catalog has none. */
function withDefaultFirst(personas: Persona[]): Persona[] {
  const own = personas.find(persona => persona.id === DEFAULT_PERSONA)
  const others = personas.filter(persona => persona.id !== DEFAULT_PERSONA)
  return [own ?? parsePersonaManifest(DEFAULT_PERSONA_TOML, DEFAULT_PERSONA), ...others]
}

/** A stored SKILL.md's `sticky` suggestion; false when it has none or no longer parses (the sync checked it). */
function stickyOf(skillMd: string | undefined, name: string): boolean {
  try {
    return parseSkillMd(skillMd ?? "", name).frontmatter.sticky === true
  } catch {
    return false
  }
}

/**
 * Tests a key the way a turn would use it: its HTTP tool's `check` request, or connecting to its MCP server (a stdio
 * one's in `sandbox`); null when there's no test.
 */
async function checkKey(
  keyed: KeyedAbility,
  apiKey: string,
  opts: { send?: FetchLike; sandbox?: McpSandbox }
): Promise<KeyCheckResult | null> {
  if (keyed.type === "tool") return (await checkHttpToolKey(keyed.ability, apiKey, { send: opts.send })) ?? null
  if (keyed.ability.transport === "stdio" && !opts.sandbox)
    return { ok: false, reason: "no MCP sandbox to start it in" }
  const check = await checkMcpAbilityKey(keyed.ability, apiKey, {
    fetch: createGuardedFetch({ send: opts.send }),
    sandbox: opts.sandbox
  })
  return check ?? null
}

/** Where an ability's calls go: its HTTP tool's or remote server's host, or the MCP sandbox for a stdio one. */
function domainOf(keyed: KeyedAbility): string {
  if (keyed.type === "tool") return new URL(keyed.ability.baseUrl).host
  return keyed.ability.url ? new URL(keyed.ability.url).host : SANDBOX_DOMAIN
}

export class AbilityService {
  readonly #db: SQL
  readonly #secrets: SecretService

  constructor(db: SQL, secrets: SecretService) {
    this.#db = db
    this.#secrets = secrets
  }

  // Offered in the cloud: still in the marketplace, and nothing that needs a shell
  get #available() {
    return this.#db`p.removed_at IS NULL AND NOT p.has_scripts`
  }

  /**
   * Whether server-wide keys can be stored (USER_SECRET_KEY is set); without it, abilities that require a key are left
   * out everywhere.
   */
  get keysEnabled(): boolean {
    return this.#secrets.enabled
  }

  /**
   * Every ability in the catalog that takes a key, one entry per ability, with whether a server-wide key is set: the
   * admin's service keys list. `key` is what the ability itself needs, whatever key is saved.
   */
  async listServiceKeys(): Promise<AbilityKey[]> {
    const saved = await this.#serviceKeyNames()
    const rows = await this.#db<(ManifestRow & { description: string })[]>`
      SELECT p.type, p.name, p.description, p.files FROM ability p
      WHERE ${this.#available} AND p.type IN ('tool', 'mcp') ORDER BY p.name, p.type`
    const keys = new Map<string, AbilityKey>()
    for (const row of rows) {
      const keyed = keys.has(row.name) ? undefined : this.#usable(row)
      const need = keyed && keyNeed(keyed.ability)
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

  /** Every available skill, with its files: a persona's `abilities` decides which of them a turn uses. */
  async skills(): Promise<CloudSkill[]> {
    const rows = await this.#db<{ name: string; description: string; files: Record<string, string> }[]>`
      SELECT p.name, p.description, p.files FROM ability p
      WHERE p.type = 'skill' AND ${this.#available} ORDER BY p.name`
    return rows.map(row => ({
      name: row.name,
      description: row.description,
      files: row.files,
      ...(stickyOf(row.files["SKILL.md"], row.name) ? { sticky: true } : {})
    }))
  }

  /** Every persona in the catalog, `default` first (the built-in one until a sync brings it): every user's roster. */
  async personaCatalog(): Promise<Persona[]> {
    const rows = await this.#db<ManifestRow[]>`
      SELECT p.type, p.name, p.files FROM ability p WHERE p.type = 'persona' AND ${this.#available} ORDER BY p.name`
    return withDefaultFirst(rows.map(row => this.#parsePersona(row)).filter(persona => persona !== undefined))
  }

  /**
   * Every dataset in the marketplace by topic, for nasi's dataset loaders; one that no longer parses is left out with a
   * warning.
   */
  async datasets(): Promise<Map<string, Dataset>> {
    const rows = await this.#db<{ name: string; files: Record<string, string> }[]>`
      SELECT p.name, p.files FROM ability p WHERE p.type = 'dataset' AND ${this.#available} ORDER BY p.name`
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

  /** The server-wide ability keys by ability name, decrypted, for a turn: every user shares them. */
  async serviceKeys(): Promise<Map<string, AbilityKeyValue>> {
    const keys = new Map<string, AbilityKeyValue>()
    for (const [name, value] of await this.#secrets.getAllService(KEY_PREFIX))
      keys.set(name.slice(KEY_PREFIX.length), { value, own: false })
    return keys
  }

  /**
   * Saves an ability's server-wide key (an admin's, every user shares it) and tests it: its HTTP tool's `check`
   * request, or connecting to its MCP server and listing the tools (a stdio one's in `sandbox`). The key is kept even
   * when the test fails. The caller's `send` and `sandbox` must reach only the official sandbox, the only one a
   * server-wide key may go to. Throws {@link import("./secret").SecretsUnavailableError} when keys can't be stored.
   */
  async saveServiceKey(
    name: string,
    apiKey: string,
    opts: { send?: FetchLike; sandbox?: McpSandbox } = {}
  ): Promise<SaveKeyResult> {
    const keyed = await this.#keyedByName(name)
    if (!keyed) return "not_found"
    if (keyed.ability.auth.type !== "apiKey") return "no_key"
    await this.#secrets.setService(abilitySecretName(name), apiKey)
    return { check: await checkKey(keyed, apiKey, opts) }
  }

  /** Removes an ability's server-wide key; false when there's no such ability. */
  async deleteServiceKey(name: string): Promise<boolean> {
    if (!(await this.#isKeyedAbility(name))) return false
    await this.#secrets.deleteService(abilitySecretName(name))
    return true
  }

  async #isKeyedAbility(name: string): Promise<boolean> {
    const rows = await this.#db`SELECT 1 FROM ability WHERE type IN ('tool', 'mcp') AND name = ${name}`
    return rows.length > 0
  }

  /** Abilities with a server-wide key. */
  async #serviceKeyNames(): Promise<Set<string>> {
    const names = await this.#secrets.serviceNames(KEY_PREFIX)
    return new Set([...names].map(name => name.slice(KEY_PREFIX.length)))
  }

  /**
   * The ability's part that takes a key (its HTTP tool before its MCP server), else its first usable part; undefined
   * when it has none here.
   */
  async #keyedByName(name: string): Promise<KeyedAbility | undefined> {
    const rows = await this.#db<ManifestRow[]>`
      SELECT p.type, p.name, p.files FROM ability p
      WHERE p.type IN ('tool', 'mcp') AND p.name = ${name} AND ${this.#available} ORDER BY p.type DESC`
    const parts = rows.flatMap(row => this.#usable(row) ?? [])
    return parts.find(part => part.ability.auth.type === "apiKey") ?? parts[0]
  }

  async #keyedOfType(type: "tool" | "mcp"): Promise<KeyedAbility[]> {
    const rows = await this.#db<ManifestRow[]>`
      SELECT p.type, p.name, p.files FROM ability p WHERE p.type = ${type} AND ${this.#available} ORDER BY p.name`
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

  /** {@link #parse}, but also undefined when it requires a key while keys can't be stored. */
  #usable(row: ManifestRow): KeyedAbility | undefined {
    const keyed = this.#parse(row)
    if (keyed && keyNeed(keyed.ability) === "required" && !this.#secrets.enabled) return undefined
    return keyed
  }
}
