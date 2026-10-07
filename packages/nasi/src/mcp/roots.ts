import { realpathSync } from "node:fs"
import { realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import type { PersonaRoot } from "@kaja/schema/cli"
import { warn } from "../warn"

/** One MCP root, as a server asks for them (`roots/list`). */
export type McpRoot = { uri: string; name: string }

/** A persona's root as a real folder (symlinks resolved), and whether the server may only read there. */
export type RootFolder = { folder: string; readOnly: boolean }

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
  const { path, readOnly } = typeof root === "string" ? { path: root, readOnly: false } : root
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
  return { folder: await realpath(resolve(expanded)), readOnly }
}

/** Folders as the roots a server gets, each named after its last segment. */
export function mcpRoots(roots: RootFolder[]): McpRoot[] {
  return roots.map(({ folder }) => ({ uri: pathToFileURL(folder).href, name: basename(folder) || folder }))
}

/**
 * Why a call that may write can't run with these roots, or undefined when it may: one of its `pathArgs` lands in a
 * read-only folder (the nearest root decides, so a writable folder inside a read-only one stays writable). Symlinks
 * are followed, a path that doesn't exist yet through its nearest existing folder. With any read-only root, a path
 * must be absolute (or `~/…`): the server resolves relative ones against its folders in its own way.
 */
export function readOnlyRefusal(
  roots: RootFolder[],
  pathArgs: string[],
  args: Record<string, unknown>
): string | undefined {
  if (!roots.some(root => root.readOnly)) return undefined
  for (const key of pathArgs) {
    const value = args[key]
    for (const path of Array.isArray(value) ? value : [value]) {
      if (typeof path !== "string") continue
      const expanded = expandHome(path)
      if (!isAbsolute(expanded) || expanded !== expanded.trim())
        return `Give ${key} as an absolute path: some folders are read-only here, so relative paths aren't taken.`
      const real = realOrNearest(resolve(expanded))
      const nearest = roots
        .filter(
          root => real === root.folder || real.startsWith(root.folder.endsWith(sep) ? root.folder : root.folder + sep)
        )
        .sort((a, b) => b.folder.length - a.folder.length)[0]
      if (nearest?.readOnly) return `${path} is in ${nearest.folder}, which is read-only for this persona.`
    }
  }
  return undefined
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
