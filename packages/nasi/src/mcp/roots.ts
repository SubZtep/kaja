import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { warn } from "../warn"

/** One MCP root, as a server asks for them (`roots/list`). */
export type McpRoot = { uri: string; name: string }

/**
 * A persona's `roots` as absolute folders: `~` and `~/…` become the home folder, and a path that isn't absolute
 * afterwards (there's no sensible folder to resolve it from) or isn't an existing folder is left out with a warning.
 */
export async function expandRoots(paths: string[], where: Record<string, string>): Promise<string[]> {
  const folders: string[] = []
  for (const path of paths) {
    const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
    if (!isAbsolute(expanded)) {
      warn("Root left out: not an absolute path or ~/…", { ...where, root: path })
      continue
    }
    const folder = resolve(expanded)
    const info = await stat(folder).catch(() => undefined)
    if (!info?.isDirectory()) {
      warn("Root left out: no such folder", { ...where, root: path })
      continue
    }
    if (!folders.includes(folder)) folders.push(folder)
  }
  return folders
}

/** Folders as the roots a server gets, each named after its last segment. */
export function mcpRoots(folders: string[]): McpRoot[] {
  return folders.map(folder => ({ uri: pathToFileURL(folder).href, name: folder.split(/[\\/]/).pop() || folder }))
}
