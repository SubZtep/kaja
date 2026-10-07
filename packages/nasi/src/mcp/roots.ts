import { realpathSync } from "node:fs"
import { cp, mkdir, readdir, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import type { PersonaRoot } from "@kaja/schema/cli"
import { warn } from "../warn"

/** One MCP root, as a server asks for them (`roots/list`). */
export type McpRoot = { uri: string; name: string }

/** A persona's root as a real folder (symlinks resolved), whether the server may only read there, and whether Kaja backs files up before it writes them. */
export type RootFolder = { folder: string; readOnly: boolean; backup?: boolean }

// `~` and `~/…` under the home folder, as the filesystem server expands them too.
function expandHome(path: string): string {
  if (path === "~") return homedir()
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

/**
 * A persona's `roots` as real folders: `~` and `~/…` become the home folder, and a path that isn't absolute afterwards
 * (there's no sensible folder to resolve it from) or isn't an existing folder is left out with a warning. A folder
 * listed twice keeps its first entry.
 */
export async function expandRoots(roots: PersonaRoot[], where: Record<string, string>): Promise<RootFolder[]> {
  const found = await Promise.all(roots.map(root => expandRoot(root, where)))
  const folders: RootFolder[] = []
  for (const root of found) if (root && !folders.some(known => known.folder === root.folder)) folders.push(root)
  return folders
}

// One `roots` entry as a real folder, or undefined (with a warning) when it isn't one.
async function expandRoot(root: PersonaRoot, where: Record<string, string>): Promise<RootFolder | undefined> {
  const { path, readOnly, backup } = typeof root === "string" ? { path: root, readOnly: false, backup: false } : root
  const expanded = expandHome(path)
  if (!isAbsolute(expanded)) {
    warn("Root left out: not an absolute path or ~/…", { ...where, root: path })
    return undefined
  }
  const info = await stat(expanded).catch(() => undefined)
  if (!info?.isDirectory()) {
    warn("Root left out: no such folder", { ...where, root: path })
    return undefined
  }
  return { folder: await realpath(resolve(expanded)), readOnly, ...(backup ? { backup: true } : {}) }
}

/** Folders as the roots a server gets, each named after its last segment. */
export function mcpRoots(roots: RootFolder[]): McpRoot[] {
  return roots.map(({ folder }) => ({ uri: pathToFileURL(folder).href, name: basename(folder) || folder }))
}

/**
 * Why a call that may write can't run with these roots, or undefined when it may: one of its `pathArgs` lands in a
 * read-only folder (the nearest root decides, so a writable folder inside a read-only one stays writable). Symlinks
 * are followed, a path that doesn't exist yet through its nearest existing folder. With any read-only or backed-up
 * root, a path must be absolute (or `~/…`): the server resolves relative ones against its folders in its own way.
 */
export function readOnlyRefusal(
  roots: RootFolder[],
  pathArgs: string[],
  args: Record<string, unknown>
): string | undefined {
  if (!roots.some(root => root.readOnly || root.backup)) return undefined
  for (const [key, path] of pathValues(pathArgs, args)) {
    const expanded = expandHome(path)
    if (!isAbsolute(expanded) || expanded !== expanded.trim())
      return `Give ${key} as an absolute path: some folders are read-only or backed up here, so relative paths aren't taken.`
    const nearest = nearestRoot(roots, realOrNearest(resolve(expanded)))
    if (nearest?.readOnly) return `${path} is in ${nearest.folder}, which is read-only for this persona.`
  }
  return undefined
}

/** The existing files and folders a call that may write names in its `pathArgs` (real paths) whose nearest root is backed up. */
export function backupPaths(roots: RootFolder[], pathArgs: string[], args: Record<string, unknown>): string[] {
  if (!roots.some(root => root.backup)) return []
  const found = new Set<string>()
  for (const [, path] of pathValues(pathArgs, args)) {
    const expanded = expandHome(path)
    if (!isAbsolute(expanded)) continue
    const real = realOrNearest(resolve(expanded))
    if (nearestRoot(roots, real)?.backup) found.add(real)
  }
  return [...found]
}

/** Where `path`'s backups live: its absolute path mirrored under `backupDir`, one entry per copy. */
export function backupFolder(backupDir: string, path: string): string {
  return join(backupDir, resolve(path).slice(1))
}

/** Copies each existing path (a folder whole) to `<backupDir>/<its path>/<time>`; never pruned. Returns the copies made. */
export async function backupFiles(paths: string[], backupDir: string): Promise<string[]> {
  const version = new Date().toISOString().replaceAll(":", "-")
  const made: string[] = []
  for (const path of paths) {
    if (!(await stat(path).catch(() => undefined))) continue
    const folder = backupFolder(backupDir, path)
    await mkdir(folder, { recursive: true })
    const copy = join(folder, await freeName(folder, version))
    await cp(path, copy, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true })
    made.push(copy)
  }
  return made
}

/** `path`'s backup versions, newest first. */
export async function listBackups(backupDir: string, path: string): Promise<string[]> {
  const names = await readdir(backupFolder(backupDir, path)).catch(() => [])
  return names.toSorted().reverse()
}

/** The nearest root holding `real` (a real path), if any. */
export function nearestRoot(roots: RootFolder[], real: string): RootFolder | undefined {
  return roots
    .filter(
      root => real === root.folder || real.startsWith(root.folder.endsWith(sep) ? root.folder : root.folder + sep)
    )
    .sort((a, b) => b.folder.length - a.folder.length)[0]
}

/** `path` with `~` expanded, resolved to its real path (through its nearest existing folder when it doesn't exist yet). */
export function realPath(path: string): string {
  return realOrNearest(resolve(expandHome(path)))
}

// Every string a call passes in `pathArgs` (an array argument gives each of its strings), with its argument's name.
function pathValues(pathArgs: string[], args: Record<string, unknown>): [string, string][] {
  return pathArgs.flatMap(key => {
    const value = args[key]
    return (Array.isArray(value) ? value : [value])
      .filter((path): path is string => typeof path === "string")
      .map(path => [key, path] as [string, string])
  })
}

// `version`, or `version-2`, `-3`… when two copies land in the same millisecond.
async function freeName(folder: string, version: string): Promise<string> {
  const taken = new Set(await readdir(folder))
  let name = version
  for (let n = 2; taken.has(name); n++) name = `${version}-${n}`
  return name
}

// The path with symlinks resolved (and, on a case-insensitive disk, its case); for one that doesn't exist yet, its nearest existing folder's real path plus the rest.
function realOrNearest(path: string): string {
  let existing = path
  while (true) {
    try {
      return join(realpathSync.native(existing), relative(existing, path))
    } catch {
      const parent = dirname(existing)
      if (parent === existing) return path
      existing = parent
    }
  }
}
