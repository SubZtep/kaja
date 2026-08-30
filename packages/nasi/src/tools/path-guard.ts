import { realpathSync } from "node:fs"
import { basename, resolve } from "node:path"
import { getActiveStorePath } from "../store"
import { getToolDeps } from "./deps"

const DENIED_FILENAMES = new Set(["secrets.toml"])

export class PathEscapeError extends Error {
  constructor(path: string) {
    super(`Path escapes the workspace: ${path}`)
    this.name = "PathEscapeError"
  }
}

export class PathDeniedError extends Error {
  constructor(path: string) {
    super(`Path is not readable: ${path}`)
    this.name = "PathDeniedError"
  }
}

/**
 * Resolves `path` against the configured workspace root (default `process.cwd()`)
 * and throws {@link PathEscapeError} if it lands outside that root — blocks `..`
 * traversal and symlink escapes via `realpath`. Also denies the active nasi
 * sqlite file and any `secrets.toml`, regardless of workspace root, since a
 * prompt-injected read_file/list_files call should never surface credentials.
 * Local-only guard, not a sandbox: a full CLI session already has shell access
 * to the same filesystem.
 */
export function guardWorkspacePath(path: string): string {
  const root = getToolDeps().workspaceRoot ?? process.cwd()
  const realRoot = realpathSync(root)
  const resolved = resolve(root, path)

  let realResolved: string
  try {
    realResolved = realpathSync(resolved)
  } catch {
    // Path doesn't exist yet (e.g. list_files on a fresh dir) — fall back to the
    // lexically resolved path, still checked against realRoot below.
    realResolved = resolved
  }

  if (realResolved !== realRoot && !realResolved.startsWith(`${realRoot}/`)) {
    throw new PathEscapeError(path)
  }

  if (DENIED_FILENAMES.has(basename(realResolved))) throw new PathDeniedError(path)
  const activeStorePath = getActiveStorePath()
  if (activeStorePath && realResolved === activeStorePath) throw new PathDeniedError(path)

  return realResolved
}
