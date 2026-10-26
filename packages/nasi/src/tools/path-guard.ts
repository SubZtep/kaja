import { realpathSync } from "node:fs"
import { basename, isAbsolute, relative, resolve, sep } from "node:path"
import { getToolDeps } from "./deps"

// Credential files no tool reads, wherever they are: Kaja's keys, and the usual stores of logins and tokens
const DENIED_FILENAMES = new Set(["secrets.toml", ".netrc", ".pgpass", ".npmrc", ".pypirc", ".git-credentials"])
// Credential folders (and files inside dot-folders), matched as whole path segments anywhere in the real path
const DENIED_FRAGMENTS = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".password-store",
  ".kube/config",
  ".docker/config.json",
  ".config/gh",
  ".config/gcloud"
]
// A project's .env files hold its keys; the checked-in examples don't
const ENV_FILE = /^\.env(\..+)?$/
const ENV_EXAMPLE = /^\.env\.(example|sample|template|dist)$/

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
 * and says whether it lands inside that root and whether any part of it below the root is hidden (a dotfile or
 * dot-folder). Always throws {@link PathDeniedError} for credential files (secrets.toml, ~/.ssh, ~/.aws, .env and the
 * like) and the configured sqlite file (with its `-wal`/`-shm`/`-journal` siblings), wherever they are, since a
 * prompt-injected call should never surface credentials or the conversation store.
 */
export function resolveWorkspacePath(path: string): { path: string; inWorkspace: boolean; hidden: boolean } {
  const root = getToolDeps().workspaceRoot ?? process.cwd()
  const realRoot = realpathSync(root)
  // Doesn't exist yet (e.g. list_files on a fresh dir): the lexically resolved path, still checked below.
  const realResolved = realOrSame(resolve(root, path))

  if (isCredential(realResolved)) throw new PathDeniedError(path)
  const storePath = getToolDeps().storePath
  if (storePath) {
    const store = realOrSame(storePath)
    if (STORE_SIBLINGS.some(suffix => realResolved === `${store}${suffix}`)) throw new PathDeniedError(path)
  }

  const fromRoot = relative(realRoot, realResolved)
  const inWorkspace = fromRoot === "" || !(fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
  const hidden = fromRoot.split(sep).some(segment => segment.startsWith(".") && segment !== "..")
  return { path: realResolved, inWorkspace, hidden }
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

/**
 * A file tool's approval summary for a hidden path inside the workspace (`<verb> <path> (hidden …)`), else undefined:
 * dotfiles often hold config and tokens the credential list doesn't know. Paths it refuses anyway don't ask.
 */
export function hiddenPathApproval(verb: string, path: unknown): string | undefined {
  if (typeof path !== "string") return undefined
  try {
    const where = resolveWorkspacePath(path)
    return where.inWorkspace && where.hidden ? `${verb} ${path} (a hidden file or folder)` : undefined
  } catch {
    return undefined
  }
}

const STORE_SIBLINGS = ["", "-wal", "-shm", "-journal"]

function isCredential(realPath: string): boolean {
  const name = basename(realPath)
  if (DENIED_FILENAMES.has(name) || (ENV_FILE.test(name) && !ENV_EXAMPLE.test(name))) return true
  const slashed = `${realPath.split(sep).join("/")}/`
  return DENIED_FRAGMENTS.some(fragment => slashed.includes(`/${fragment}/`))
}

function realOrSame(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
