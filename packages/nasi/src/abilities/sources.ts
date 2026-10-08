import { existsSync } from "node:fs"
import { chmod, copyFile, mkdir, readdir, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

/** Where marketplace abilities come from: a GitHub repo at a branch or tag, or a folder on this machine (development). */
export type MarketplaceSource = { repo: string; ref: string } | { path: string }

/** A source after {@link resolveSources}: its commit (undefined for a folder), and how to name it in messages. */
export type ResolvedSource = { source: MarketplaceSource; label: string; commit?: string }

/** The top-level folders a marketplace holds; anything else in a source repo (CI, README, configs) isn't synced. */
export const MARKETPLACE_FOLDERS = ["abilities", "personas", "datasets"] as const

/** The public marketplace every host pulls unless configured otherwise. */
export const DEFAULT_MARKETPLACE_SOURCE = "kajaio/marketplace"

const MAX_TARBALL_BYTES = 50 * 1024 * 1024
const COMMIT_SHA = /^[0-9a-f]{40}$/
const REPO = /^[\w.-]+\/[\w.-]+$/

/** A source that can't be fetched (bad entry, GitHub refused, network, broken tarball), with a message fit to show as-is. */
export class MarketplaceSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MarketplaceSourceError"
  }
}

/** Parses one configured entry: `owner/repo`, `owner/repo#ref` (default ref `main`), or a folder starting with `/`, `.` or `~`. */
export function parseMarketplaceSource(entry: string): MarketplaceSource {
  const text = entry.trim()
  if (/^[/.~]/.test(text)) return { path: text.startsWith("~") ? join(homedir(), text.slice(1)) : resolve(text) }
  const [repo = "", ref = "main"] = text.split("#")
  if (!REPO.test(repo) || !ref)
    throw new MarketplaceSourceError(`"${entry}" is not owner/repo, owner/repo#ref or a folder path`)
  return { repo, ref }
}

/** Parses a comma-separated list of entries (the API's and the sandbox's env form), skipping blanks. */
export function parseMarketplaceSources(list: string): MarketplaceSource[] {
  return list
    .split(",")
    .filter(entry => entry.trim())
    .map(parseMarketplaceSource)
}

/** How a source shows in messages and sync records: `owner/repo#ref`, or the folder. */
export function sourceLabel(source: MarketplaceSource): string {
  return "path" in source ? source.path : `${source.repo}#${source.ref}`
}

type FetchOptions = {
  /** Sent to api.github.com only; needed for a private repo. */
  token?: string
  fetch?: typeof fetch
}

function githubHeaders(token: string | undefined, accept: string): Record<string, string> {
  return { Accept: accept, "User-Agent": "kaja", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

/** Each source's current commit (GitHub's sha-only reply, one small call per repo); a folder has none, and must exist. */
export async function resolveSources(sources: MarketplaceSource[], opts: FetchOptions = {}): Promise<ResolvedSource[]> {
  const fetchImpl = opts.fetch ?? fetch
  return Promise.all(
    sources.map(async source => {
      const label = sourceLabel(source)
      if ("path" in source) {
        if (!existsSync(source.path)) throw new MarketplaceSourceError(`${label} doesn't exist`)
        return { source, label }
      }
      const res = await fetchImpl(
        `https://api.github.com/repos/${source.repo}/commits/${encodeURIComponent(source.ref)}`,
        { headers: githubHeaders(opts.token, "application/vnd.github.sha"), signal: AbortSignal.timeout(15_000) }
      ).catch(error => {
        throw new MarketplaceSourceError(
          `Can't reach GitHub for ${label}: ${error instanceof Error ? error.message : error}`
        )
      })
      // GitHub answers 404 for a private repo without access, so say both.
      if (res.status === 404)
        throw new MarketplaceSourceError(`${label} not found (or private, and no token gives access)`)
      if (!res.ok) throw new MarketplaceSourceError(`GitHub commit lookup for ${label} failed: HTTP ${res.status}`)
      const commit = (await res.text()).trim()
      if (!COMMIT_SHA.test(commit))
        throw new MarketplaceSourceError(`GitHub returned an unexpected commit for ${label}`)
      return { source, label, commit }
    })
  )
}

/** Downloads a resolved GitHub source's tarball at its commit into `dir` and returns the extracted repo folder; a folder source is returned as it is. */
export async function downloadSource(resolved: ResolvedSource, dir: string, opts: FetchOptions = {}): Promise<string> {
  const { source, label, commit } = resolved
  if ("path" in source) return source.path
  const fetchImpl = opts.fetch ?? fetch
  // codeload has no rate limit for public repos; a private one needs the token, which only the API endpoint takes.
  const url = opts.token
    ? `https://api.github.com/repos/${source.repo}/tarball/${commit}`
    : `https://codeload.github.com/${source.repo}/tar.gz/${commit}`
  const res = await fetchImpl(url, {
    headers: githubHeaders(opts.token, "application/vnd.github+json"),
    signal: AbortSignal.timeout(60_000)
  }).catch(error => {
    throw new MarketplaceSourceError(`Downloading ${label} failed: ${error instanceof Error ? error.message : error}`)
  })
  if (!res.ok) throw new MarketplaceSourceError(`Downloading ${label} failed: HTTP ${res.status}`)
  if (Number(res.headers.get("content-length") ?? 0) > MAX_TARBALL_BYTES)
    throw new MarketplaceSourceError(`${label} is larger than expected`)
  const bytes = await res.bytes()
  if (bytes.byteLength > MAX_TARBALL_BYTES) throw new MarketplaceSourceError(`${label} is larger than expected`)

  await rm(dir, { recursive: true, force: true })
  try {
    await new Bun.Archive(bytes).extract(dir)
  } catch (error) {
    throw new MarketplaceSourceError(`Extracting ${label} failed: ${error instanceof Error ? error.message : error}`)
  }
  // GitHub tarballs hold one top-level folder, <owner>-<repo>-<sha>/.
  const top = (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isDirectory())
  if (top.length !== 1) throw new MarketplaceSourceError(`${label} tarball doesn't have one top-level folder`)
  return join(dir, top[0]!.name)
}

/** Every file under `dir`, relative with `/` separators, skipping dot-entries (.git, the sync lock). */
export async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const entries = await readdir(join(dir, rel), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await listFiles(dir, path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

/** Copies with the source's permission bits, so a script's exec bit survives. */
export async function copyWithMode(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
  await chmod(to, (await stat(from)).mode & 0o777)
}

/** The unit a later source replaces whole: `abilities/<name>` (the folder), `personas/<id>.toml`, `datasets/<topic>.json`. */
function unitOf(path: string): string {
  return path.split("/").slice(0, 2).join("/")
}

/**
 * Builds one marketplace folder in `outDir` (emptied first) from source folders in order. A later source replaces an
 * earlier one's ability folder, persona or dataset whole, so two repos' files never mix inside one ability. Returns
 * the units a later source replaced.
 */
export async function mergeSources(
  sources: { label: string; dir: string }[],
  outDir: string
): Promise<{ replaced: { unit: string; by: string }[] }> {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const owner = new Map<string, string>()
  const replaced: { unit: string; by: string }[] = []
  for (const { label, dir } of sources) {
    const files: string[] = []
    for (const folder of MARKETPLACE_FOLDERS)
      if (existsSync(join(dir, folder))) files.push(...(await listFiles(dir, folder)))
    for (const unit of new Set(files.map(unitOf))) {
      if (owner.has(unit)) {
        await rm(join(outDir, unit), { recursive: true, force: true })
        replaced.push({ unit, by: label })
      }
      owner.set(unit, label)
    }
    for (const path of files) await copyWithMode(join(dir, path), join(outDir, path))
  }
  return { replaced }
}

/** How many times {@link fetchSources} calls its `onStep`: commits looked up, downloaded, merged. */
export const FETCH_SOURCES_STEPS = 3

/**
 * Resolves, downloads (each into its own folder under `workDir`) and merges `sources` into `outDir`; what the TUI and
 * the sandbox run. `outDir` is only touched once every source has downloaded, so a failure leaves the last good copy.
 */
export async function fetchSources(
  sources: MarketplaceSource[],
  outDir: string,
  opts: FetchOptions & { workDir: string; onStep?: () => void }
): Promise<{ sources: ResolvedSource[]; replaced: { unit: string; by: string }[] }> {
  try {
    const resolved = await resolveSources(sources, opts)
    opts.onStep?.()
    const dirs: { label: string; dir: string }[] = []
    for (const [i, source] of resolved.entries())
      dirs.push({ label: source.label, dir: await downloadSource(source, join(opts.workDir, String(i)), opts) })
    opts.onStep?.()
    const { replaced } = await mergeSources(dirs, outDir)
    opts.onStep?.()
    return { sources: resolved, replaced }
  } finally {
    await rm(opts.workDir, { recursive: true, force: true })
  }
}
