import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  downloadSource,
  type MarketplaceSource,
  mergeSources,
  parseHttpToolManifest,
  parseMcpManifest,
  parsePersonaManifest,
  type ResolvedSource,
  readSkillBundle,
  resolveSources,
  scanDatasets,
  scanHttpTools,
  scanMcpAbilities,
  scanPersonas,
  scanSkills
} from "@kaja/nasi"
import type { MarketplaceSyncResult, MarketplaceSyncStatus } from "@kaja/schema/api"
import { isPublicHttpUrl } from "@kaja/shared/net"
import type { Pool } from "pg"
import { withLock } from "../core/lock"
import { reportError } from "../core/report"
import { cloudMcpProblem } from "./ability"

/** What the sync records as its commit: each source as `owner/repo#ref@sha` (a folder by its path), comma-separated. */
function fingerprint(sources: ResolvedSource[]): string {
  return sources.map(({ label, commit }) => (commit ? `${label}@${commit}` : label)).join(", ")
}

/**
 * Keeps the `ability` table in step with the marketplace sources (GitHub repos merged in order, later ones winning: skills, personas, datasets, HTTP
 * tools, MCP servers). A sync asks GitHub for each source's commit first and only downloads the tarballs when one moved; a folder source (development)
 * is re-read every time. Abilities are never deleted: one that leaves the marketplace gets `removed_at`, so users' selections survive.
 */
export class MarketplaceService {
  readonly #db: Pool
  readonly #sources: MarketplaceSource[]
  readonly #token: string | undefined
  readonly #fetch: typeof fetch

  constructor(db: Pool, sources: MarketplaceSource[], opts: { token?: string; fetch?: typeof fetch } = {}) {
    this.#db = db
    this.#sources = sources
    this.#token = opts.token
    this.#fetch = opts.fetch ?? fetch
  }

  async status(): Promise<MarketplaceSyncStatus> {
    const { rows } = await this.#db.query("SELECT commit, synced_at, error FROM marketplace_sync WHERE id = 1")
    const row = rows[0]
    return {
      commit: row?.commit ?? null,
      syncedAt: row?.synced_at ? new Date(row.synced_at) : null,
      error: row?.error ?? null
    }
  }

  /** Fetches and applies the marketplace when the branch moved (or always, with `force`). Errors are recorded in the status and rethrown. */
  sync(opts: { force?: boolean } = {}): Promise<MarketplaceSyncResult> {
    return withLock("marketplace-sync", async () => {
      try {
        const fetchOpts = { token: this.#token, fetch: this.#fetch }
        const resolved = await resolveSources(this.#sources, fetchOpts)
        const commit = fingerprint(resolved)
        const hasFolder = resolved.some(source => !source.commit)
        if (!opts.force && !hasFolder && (await this.status()).commit === commit) {
          await this.#recordSuccess(commit)
          return { commit, changed: false, added: [], updated: [], removed: [] }
        }
        const dir = await mkdtemp(join(tmpdir(), "kaja-marketplace-"))
        try {
          const dirs: { label: string; dir: string }[] = []
          for (const [i, source] of resolved.entries())
            dirs.push({ label: source.label, dir: await downloadSource(source, join(dir, String(i)), fetchOpts) })
          const marketplaceDir = join(dir, "merged")
          await mergeSources(dirs, marketplaceDir)
          const result = await this.syncFromDir(marketplaceDir, commit)
          await this.#recordSuccess(commit)
          return { commit, changed: true, ...result }
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reportError("Marketplace sync failed", error)
        await this.#db.query(
          `INSERT INTO marketplace_sync (id, error) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error`,
          [message]
        )
        throw error
      }
    })
  }

  /** Applies a marketplace folder already on disk: upserts every valid skill, persona, HTTP tool and MCP ability, marks the rest removed. No network — the sync and tests both use it. */
  async syncFromDir(
    marketplaceDir: string,
    commit: string
  ): Promise<Omit<MarketplaceSyncResult, "commit" | "changed">> {
    const bundles: AbilityBundle[] = []
    for (const entry of await scanSkills(marketplaceDir)) {
      if (entry.error) {
        console.warn("Marketplace skill skipped", { skill: entry.name, error: entry.error })
        continue
      }
      bundles.push({ type: "skill", ...(await readSkillBundle(marketplaceDir, entry.name)) })
    }
    bundles.push(
      ...(await readPersonaFiles(marketplaceDir)),
      ...(await readDatasetFiles(marketplaceDir)),
      ...(await readHttpTools(marketplaceDir)),
      ...(await readMcpAbilities(marketplaceDir))
    )

    const client = await this.#db.connect()
    try {
      await client.query("BEGIN")
      const { rows: existing } = await client.query(
        "SELECT type, name, content_hash, removed_at FROM ability WHERE type = ANY($1)",
        [SYNCED_TYPES]
      )
      const before = new Map(existing.map(row => [`${row.type}:${row.name}`, row]))
      const added: string[] = []
      const updated: string[] = []

      for (const bundle of bundles) {
        const hash = contentHash(bundle)
        const previous = before.get(`${bundle.type}:${bundle.name}`)
        if (!previous) added.push(reportName(bundle.type, bundle.name))
        else if (previous.content_hash !== hash || previous.removed_at)
          updated.push(reportName(bundle.type, bundle.name))
        await client.query(
          `
          INSERT INTO ability (type, name, description, files, has_scripts, content_hash, commit)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (type, name) DO UPDATE SET
            description = EXCLUDED.description,
            files = EXCLUDED.files,
            has_scripts = EXCLUDED.has_scripts,
            content_hash = EXCLUDED.content_hash,
            commit = EXCLUDED.commit,
            removed_at = NULL,
            updated_at = CASE
              WHEN ability.content_hash <> EXCLUDED.content_hash OR ability.removed_at IS NOT NULL THEN NOW()
              ELSE ability.updated_at
            END
          `,
          [bundle.type, bundle.name, bundle.description, JSON.stringify(bundle.files), bundle.hasScripts, hash, commit]
        )
      }

      const removed: string[] = []
      for (const type of SYNCED_TYPES) {
        const { rows: gone } = await client.query(
          `
          UPDATE ability SET removed_at = NOW(), updated_at = NOW()
          WHERE type = $1 AND removed_at IS NULL AND NOT (name = ANY($2))
          RETURNING name
          `,
          [type, bundles.filter(bundle => bundle.type === type).map(bundle => bundle.name)]
        )
        removed.push(...gone.map(row => reportName(type, row.name as string)))
      }
      await client.query("COMMIT")
      return { added, updated, removed }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }

  async #recordSuccess(commit: string) {
    await this.#db.query(
      `
      INSERT INTO marketplace_sync (id, commit, synced_at, error) VALUES (1, $1, NOW(), NULL)
      ON CONFLICT (id) DO UPDATE SET commit = EXCLUDED.commit, synced_at = EXCLUDED.synced_at, error = NULL
      `,
      [commit]
    )
  }
}

/** Ability types the sync owns; anything else in the table is left alone. */
const SYNCED_TYPES = ["skill", "persona", "dataset", "tool", "mcp"] as const

/** Where a manifest lives in the marketplace, and the key its text is stored under in `ability.files`. */
function manifestFile(type: Exclude<AbilityBundle["type"], "skill">, name: string): { path: string; key: string } {
  if (type === "persona") return { path: `personas/${name}.toml`, key: `${name}.toml` }
  if (type === "dataset") return { path: `datasets/${name}.json`, key: `${name}.json` }
  // An ability folder's HTTP tool and MCP server parts.
  const key = type === "tool" ? "tool.toml" : "mcp.toml"
  return { path: `abilities/${name}/${key}`, key }
}

type AbilityBundle = {
  type: (typeof SYNCED_TYPES)[number]
  name: string
  description: string
  files: Record<string, string>
  hasScripts: boolean
}

/** How an ability shows in a sync result: skills by name, personas and datasets by folder and id, an ability's tool and MCP parts by their file. */
function reportName(type: AbilityBundle["type"], name: string): string {
  if (type === "skill") return name
  if (type === "persona" || type === "dataset") return `${type}s/${name}`
  return manifestFile(type, name).path
}

/**
 * One marketplace folder's manifests as stored text: each scanned entry's file is read and turned into a bundle by
 * `toBundle`, which throws to skip it; a broken or refused one is skipped with a warning naming `kind`.
 */
async function readManifests<Entry extends { name: string; error?: string }>(
  marketplaceDir: string,
  kind: { type: Exclude<AbilityBundle["type"], "skill">; label: string },
  entries: Entry[],
  toBundle: (text: string, entry: Entry) => { name: string; description: string }
): Promise<AbilityBundle[]> {
  const bundles = await Promise.all(
    entries.map(async (entry): Promise<AbilityBundle | undefined> => {
      const file = manifestFile(kind.type, entry.name)
      try {
        if (entry.error) throw new Error(entry.error)
        const text = await readFile(join(marketplaceDir, file.path), "utf8")
        return { type: kind.type, ...toBundle(text, entry), files: { [file.key]: text }, hasScripts: false }
      } catch (error) {
        console.warn(`Marketplace ${kind.label} skipped`, {
          [kind.type]: entry.name,
          error: error instanceof Error ? error.message : error
        })
        return undefined
      }
    })
  )
  return bundles.filter(bundle => bundle !== undefined)
}

/** Every valid `personas/*.toml`, with its label as the description; `localOnly` ones are skipped. */
async function readPersonaFiles(marketplaceDir: string): Promise<AbilityBundle[]> {
  return readManifests(
    marketplaceDir,
    { type: "persona", label: "persona" },
    await scanPersonas(marketplaceDir),
    (text, entry) => {
      const persona = parsePersonaManifest(text, entry.name)
      if (persona.localOnly) throw new Error("it only runs on the user's own machine")
      return { name: entry.name, description: persona.label }
    }
  )
}

/** Every valid `datasets/*.json`, with its label as the description. */
async function readDatasetFiles(marketplaceDir: string): Promise<AbilityBundle[]> {
  return readManifests(
    marketplaceDir,
    { type: "dataset", label: "dataset" },
    await scanDatasets(marketplaceDir),
    (_text, entry) => {
      if (!entry.label) throw new Error("no label")
      return { name: entry.name, description: entry.label }
    }
  )
}

/** Every valid ability `tool.toml`; ones that call a non-public host are skipped (the ability's other parts still sync). */
async function readHttpTools(marketplaceDir: string): Promise<AbilityBundle[]> {
  return readManifests(
    marketplaceDir,
    { type: "tool", label: "HTTP tool" },
    await scanHttpTools(marketplaceDir),
    (text, entry) => {
      const ability = parseHttpToolManifest(text, entry.name)
      if (!isPublicHttpUrl(ability.baseUrl)) throw new Error(`${ability.baseUrl} isn't a public address`)
      return { name: ability.name, description: ability.description }
    }
  )
}

/**
 * Every ability `mcp.toml` the cloud could run. Skipped: ones without a `tools` allowlist, on a non-public host, or local-only (the
 * ability's other parts still sync). stdio servers are kept whether or not an MCP sandbox is configured right now;
 * offering them checks that.
 */
async function readMcpAbilities(marketplaceDir: string): Promise<AbilityBundle[]> {
  return readManifests(
    marketplaceDir,
    { type: "mcp", label: "MCP ability" },
    await scanMcpAbilities(marketplaceDir),
    (text, entry) => {
      const ability = parseMcpManifest(text, entry.name)
      const problem = cloudMcpProblem(ability)
      if (problem) throw new Error(problem)
      return { name: ability.name, description: ability.description }
    }
  )
}

/** Stable hash of what the agent sees of an ability, so an unchanged one keeps its updated_at. */
function contentHash(bundle: { description: string; files: Record<string, string>; hasScripts: boolean }): string {
  // Code-unit order, not localeCompare: the hash mustn't change with the server's locale. Keys are unique, so never equal.
  const files = Object.keys(bundle.files)
    .sort((a, b) => (a < b ? -1 : 1))
    .map(path => [path, bundle.files[path]])
  return createHash("sha256")
    .update(JSON.stringify([bundle.description, bundle.hasScripts, files]))
    .digest("hex")
}
