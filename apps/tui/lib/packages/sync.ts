import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, readdir, readFile, rm, rmdir, stat } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { file, write } from "bun"
import { nextBackupPath } from "../config/fetch"

/** Sits in the marketplace folder; the leading dot keeps it out of skill listings and out of the sync itself. */
export const LOCK_FILE = ".sync-lock.json"

/** What the last sync wrote: its source, and each file's hash as written, so a later sync can tell your edits from untouched upstream copies. */
export type SyncLock = {
  source?: { url: string; ref: string; commit: string }
  files: Record<string, string>
}

export type SyncReport = {
  added: string[]
  updated: string[]
  /** Upstream replaced a file you had edited; yours was saved to `backup`. */
  backedUp: { path: string; backup: string }[]
  removed: string[]
  /** Removed upstream, but you had edited it, so it stays as your own file. */
  kept: string[]
}

export async function readSyncLock(marketplaceDir: string): Promise<SyncLock | undefined> {
  try {
    const f = file(join(marketplaceDir, LOCK_FILE))
    if (!(await f.exists())) return undefined
    const data = await f.json()
    return data && typeof data === "object" && data.files ? (data as SyncLock) : undefined
  } catch {
    return undefined
  }
}

async function hashFile(path: string): Promise<string | undefined> {
  try {
    return createHash("sha256")
      .update(await readFile(path))
      .digest("hex")
  } catch {
    return undefined
  }
}

/** Every file under `dir`, relative with `/` separators, skipping dot-entries (.git, the lock file). */
async function listFiles(dir: string, rel = ""): Promise<string[]> {
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
async function copyWithMode(from: string, to: string) {
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
  await chmod(to, (await stat(from)).mode & 0o777)
}

/** Removes now-empty parent folders of `path`, stopping at `root`. */
async function pruneEmptyDirs(root: string, path: string) {
  let dir = dirname(path)
  while (relative(root, dir) && !relative(root, dir).startsWith("..")) {
    try {
      await rmdir(dir)
    } catch {
      return
    }
    dir = dirname(dir)
  }
}

/**
 * Copies an upstream marketplace folder into the local one. Files are compared to the lock
 * from the previous sync: untouched copies follow upstream, edited ones are backed up
 * (`.bak`, `.bak2`, …) before upstream replaces them, and files the lock never recorded and
 * upstream doesn't have are yours and never touched.
 */
export async function syncMarketplace(
  upstreamDir: string,
  localDir: string,
  source?: SyncLock["source"]
): Promise<SyncReport> {
  const lock = (await readSyncLock(localDir)) ?? { files: {} }
  const report: SyncReport = { added: [], updated: [], backedUp: [], removed: [], kept: [] }
  const files: Record<string, string> = {}

  for (const path of await listFiles(upstreamDir)) {
    const from = join(upstreamDir, path)
    const to = join(localDir, path)
    const upstreamHash = (await hashFile(from))!
    const localHash = await hashFile(to)
    files[path] = upstreamHash

    if (localHash === undefined) {
      await copyWithMode(from, to)
      report.added.push(path)
    } else if (localHash === upstreamHash) {
      await chmod(to, (await stat(from)).mode & 0o777)
    } else if (lock.files[path] === localHash) {
      await copyWithMode(from, to)
      report.updated.push(path)
    } else {
      const backup = await nextBackupPath(to)
      await copyFile(to, backup)
      await copyWithMode(from, to)
      report.backedUp.push({ path, backup: relative(localDir, backup) })
    }
  }

  for (const [path, lockedHash] of Object.entries(lock.files)) {
    if (path in files) continue
    const to = join(localDir, path)
    const localHash = await hashFile(to)
    if (localHash === undefined) continue
    if (localHash === lockedHash) {
      await rm(to)
      await pruneEmptyDirs(localDir, to)
      report.removed.push(path)
    } else {
      report.kept.push(path)
    }
  }

  const nextLock: SyncLock = { ...(source ? { source } : {}), files }
  await write(join(localDir, LOCK_FILE), `${JSON.stringify(nextLock, null, 2)}\n`)
  return report
}
