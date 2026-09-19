import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { info, warn } from "@kaja/logger"
import {
  parseHttpToolManifest,
  parseMcpManifest,
  parsePersonaManifest,
  readSkillBundle,
  scanHttpTools,
  scanMcpPackages,
  scanPersonas,
  scanSkills
} from "@kaja/nasi"
import type { MarketplaceSyncResult, MarketplaceSyncStatus } from "@kaja/schema/api"
import { isPublicHttpUrl } from "@kaja/shared"
import type { Pool } from "pg"
import { withLock } from "../core/lock"
import { cloudMcpProblem } from "./package"

const MAX_TARBALL_BYTES = 50 * 1024 * 1024
const COMMIT_SHA = /^[0-9a-f]{40}$/

export type MarketplaceSource = { repo: string; ref: string }

/**
 * Keeps the `package` table in step with the `marketplace/` folder (skills, personas, HTTP tools, MCP servers) of a GitHub repo. A sync asks
 * GitHub for the branch's commit first and only downloads the tarball when it moved. Packages are
 * never deleted: one that leaves the marketplace gets `removed_at`, so users' selections survive.
 */
export class MarketplaceService {
  readonly #db: Pool
  readonly #source: MarketplaceSource
  readonly #fetch: typeof fetch

  constructor(db: Pool, source: MarketplaceSource, fetchImpl: typeof fetch = fetch) {
    this.#db = db
    this.#source = source
    this.#fetch = fetchImpl
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
        const commit = await this.#latestCommit()
        if (!opts.force && (await this.status()).commit === commit) {
          await this.#recordSuccess(commit)
          return { commit, changed: false, added: [], updated: [], removed: [] }
        }
        const dir = await mkdtemp(join(tmpdir(), "kaja-marketplace-"))
        try {
          const marketplaceDir = await this.#download(commit, dir)
          const result = await this.syncFromDir(marketplaceDir, commit)
          await this.#recordSuccess(commit)
          info("Marketplace synced", { commit, ...result })
          return { commit, changed: true, ...result }
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warn("Marketplace sync failed", { error: message })
        await this.#db.query(
          `INSERT INTO marketplace_sync (id, error) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error`,
          [message]
        )
        throw error
      }
    })
  }

  /** Applies a marketplace folder already on disk: upserts every valid skill, persona, HTTP tool and MCP package, marks the rest removed. No network — the sync and tests both use it. */
  async syncFromDir(
    marketplaceDir: string,
    commit: string
  ): Promise<Omit<MarketplaceSyncResult, "commit" | "changed">> {
    const bundles: PackageBundle[] = []
    for (const entry of await scanSkills(marketplaceDir)) {
      if (entry.error) {
        warn("Marketplace skill skipped", { skill: entry.name, error: entry.error })
        continue
      }
      bundles.push({ type: "skill", ...(await readSkillBundle(marketplaceDir, entry.name)) })
    }
    bundles.push(...(await readPersonaFiles(marketplaceDir)))
    const tools = await readHttpTools(marketplaceDir)
    bundles.push(...tools)
    bundles.push(...(await readMcpPackages(marketplaceDir, new Set(tools.map(tool => tool.name)))))

    const client = await this.#db.connect()
    try {
      await client.query("BEGIN")
      const { rows: existing } = await client.query(
        "SELECT type, name, content_hash, removed_at FROM package WHERE type = ANY($1)",
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
          INSERT INTO package (type, name, description, files, has_scripts, content_hash, commit)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (type, name) DO UPDATE SET
            description = EXCLUDED.description,
            files = EXCLUDED.files,
            has_scripts = EXCLUDED.has_scripts,
            content_hash = EXCLUDED.content_hash,
            commit = EXCLUDED.commit,
            removed_at = NULL,
            updated_at = CASE
              WHEN package.content_hash <> EXCLUDED.content_hash OR package.removed_at IS NOT NULL THEN NOW()
              ELSE package.updated_at
            END
          `,
          [bundle.type, bundle.name, bundle.description, JSON.stringify(bundle.files), bundle.hasScripts, hash, commit]
        )
      }

      const removed: string[] = []
      for (const type of SYNCED_TYPES) {
        const { rows: gone } = await client.query(
          `
          UPDATE package SET removed_at = NOW(), updated_at = NOW()
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

  /** The branch's head commit, via GitHub's sha-only response (one small, unauthenticated call). */
  async #latestCommit(): Promise<string> {
    const { repo, ref } = this.#source
    const res = await this.#fetch(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, {
      headers: { Accept: "application/vnd.github.sha", "User-Agent": "kaja-api" },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) throw new Error(`GitHub commit lookup for ${repo}@${ref} failed: HTTP ${res.status}`)
    const sha = (await res.text()).trim()
    if (!COMMIT_SHA.test(sha)) throw new Error(`GitHub returned an unexpected commit for ${repo}@${ref}`)
    return sha
  }

  /** Downloads the commit's tarball into `dir`, extracts it with tar, and returns the extracted marketplace/ folder. */
  async #download(commit: string, dir: string): Promise<string> {
    const { repo } = this.#source
    const res = await this.#fetch(`https://codeload.github.com/${repo}/tar.gz/${commit}`, {
      headers: { "User-Agent": "kaja-api" },
      signal: AbortSignal.timeout(60_000)
    })
    if (!res.ok) throw new Error(`Downloading ${repo}@${commit} failed: HTTP ${res.status}`)
    const tarball = await res.arrayBuffer()
    if (tarball.byteLength > MAX_TARBALL_BYTES) throw new Error(`${repo}@${commit} is larger than expected`)

    const archive = join(dir, "repo.tar.gz")
    await Bun.write(archive, tarball)
    const tar = Bun.spawn(["tar", "-xzf", archive, "-C", dir], { stdout: "ignore", stderr: "pipe" })
    if ((await tar.exited) !== 0) {
      throw new Error(`Extracting ${repo}@${commit} failed: ${(await new Response(tar.stderr).text()).trim()}`)
    }
    // GitHub tarballs hold one top-level folder, <repo>-<sha>/.
    const top = (await readdir(dir, { withFileTypes: true })).find(entry => entry.isDirectory())
    if (!top) throw new Error(`${repo}@${commit} tarball has no top-level folder`)
    return join(dir, top.name, "marketplace")
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

/** Package types the sync owns; anything else in the table is left alone. */
const SYNCED_TYPES = ["skill", "persona", "tool", "mcp"] as const

const MARKETPLACE_FOLDER: Record<PackageBundle["type"], string> = {
  skill: "skills",
  persona: "personas",
  tool: "tools",
  mcp: "mcp"
}

type PackageBundle = {
  type: (typeof SYNCED_TYPES)[number]
  name: string
  description: string
  files: Record<string, string>
  hasScripts: boolean
}

/** How a package shows in a sync result: skills by name, others by their marketplace path. */
function reportName(type: PackageBundle["type"], name: string): string {
  return type === "skill" ? name : `${MARKETPLACE_FOLDER[type]}/${name}`
}

/** Every valid `personas/*.toml` as stored text, with its label as the description; broken ones are skipped with a warning. */
async function readPersonaFiles(marketplaceDir: string): Promise<PackageBundle[]> {
  const bundles: PackageBundle[] = []
  for (const entry of await scanPersonas(marketplaceDir)) {
    const file = `${entry.name}.toml`
    try {
      if (entry.error) throw new Error(entry.error)
      const text = await readFile(join(marketplaceDir, "personas", file), "utf8")
      const persona = parsePersonaManifest(text, entry.name)
      bundles.push({
        type: "persona",
        name: entry.name,
        description: persona.label,
        files: { [file]: text },
        hasScripts: false
      })
    } catch (error) {
      warn("Marketplace persona skipped", {
        persona: entry.name,
        error: error instanceof Error ? error.message : error
      })
    }
  }
  return bundles
}

/** Every valid `tools/*.toml` as stored text; broken manifests and ones that call a non-public host are skipped with a warning. */
async function readHttpTools(marketplaceDir: string): Promise<PackageBundle[]> {
  const bundles: PackageBundle[] = []
  for (const entry of await scanHttpTools(marketplaceDir)) {
    const file = `${entry.name}.toml`
    try {
      if (entry.error) throw new Error(entry.error)
      const text = await readFile(join(marketplaceDir, "tools", file), "utf8")
      const pkg = parseHttpToolManifest(text, entry.name)
      if (!isPublicHttpUrl(pkg.baseUrl)) throw new Error(`${pkg.baseUrl} isn't a public address`)
      bundles.push({
        type: "tool",
        name: pkg.name,
        description: pkg.description,
        files: { [file]: text },
        hasScripts: false
      })
    } catch (error) {
      warn("Marketplace HTTP tool skipped", { tool: entry.name, error: error instanceof Error ? error.message : error })
    }
  }
  return bundles
}

/**
 * Every `mcp/*.toml` the cloud can run, as stored text. Skipped with a warning: broken manifests, stdio
 * servers, ones without a `tools` allowlist or on a non-public host, and names a tool already has (keys
 * share one namespace per name).
 */
async function readMcpPackages(marketplaceDir: string, toolNames: Set<string>): Promise<PackageBundle[]> {
  const bundles: PackageBundle[] = []
  for (const entry of await scanMcpPackages(marketplaceDir)) {
    const file = `${entry.name}.toml`
    try {
      if (entry.error) throw new Error(entry.error)
      if (toolNames.has(entry.name)) throw new Error(`an HTTP tool is already called ${entry.name}`)
      const text = await readFile(join(marketplaceDir, "mcp", file), "utf8")
      const pkg = parseMcpManifest(text, entry.name)
      const problem = cloudMcpProblem(pkg)
      if (problem) throw new Error(problem)
      bundles.push({
        type: "mcp",
        name: pkg.name,
        description: pkg.description,
        files: { [file]: text },
        hasScripts: false
      })
    } catch (error) {
      warn("Marketplace MCP package skipped", {
        mcp: entry.name,
        error: error instanceof Error ? error.message : error
      })
    }
  }
  return bundles
}

/** Stable hash of what the agent sees of a package, so an unchanged one keeps its updated_at. */
function contentHash(bundle: { description: string; files: Record<string, string>; hasScripts: boolean }): string {
  const files = Object.keys(bundle.files)
    .sort()
    .map(path => [path, bundle.files[path]])
  return createHash("sha256")
    .update(JSON.stringify([bundle.description, bundle.hasScripts, files]))
    .digest("hex")
}
