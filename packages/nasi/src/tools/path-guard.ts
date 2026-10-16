import { realpathSync } from "node:fs"
import { basename, resolve } from "node:path"
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
 * Resolves `path` against the configured workspace root (default `process.cwd()`), following symlinks via `realpath`,
 * and says whether it lands inside that root. Always throws {@link PathDeniedError} for any `secrets.toml` and the
 * configured sqlite file (with its `-wal`/`-shm`/`-journal` siblings), wherever they are, since a prompt-injected call
 * should never surface credentials or the conversation store.
 */
export function resolveWorkspacePath(path: string): { path: string; inWorkspace: boolean } {
  const root = getToolDeps().workspaceRoot ?? process.cwd()
  const realRoot = realpathSync(root)
  // Doesn't exist yet (e.g. list_files on a fresh dir): the lexically resolved path, still checked below.
  const realResolved = realOrSame(resolve(root, path))

  if (DENIED_FILENAMES.has(basename(realResolved))) throw new PathDeniedError(path)
  const storePath = getToolDeps().storePath
  if (storePath) {
    const store = realOrSame(storePath)
    if (STORE_SIBLINGS.some(suffix => realResolved === `${store}${suffix}`)) throw new PathDeniedError(path)
  }

  return { path: realResolved, inWorkspace: realResolved === realRoot || realResolved.startsWith(`${realRoot}/`) }
}

/**
 * {@link resolveWorkspacePath}, throwing {@link PathEscapeError} if the path lands outside the workspace root — blocks
 * `..` traversal and symlink escapes. Local-only guard, not a sandbox: a full CLI session already has shell access to
 * the same filesystem.
 */
export function guardWorkspacePath(path: string): string {
  const resolved = resolveWorkspacePath(path)
  if (!resolved.inWorkspace) throw new PathEscapeError(path)
  return resolved.path
}

const STORE_SIBLINGS = ["", "-wal", "-shm", "-journal"]

function realOrSame(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
