import { stat } from "node:fs/promises"

/** The Linux user and group a server process runs as. */
export type RunAs = { uid: number; gid: number }

/** Where the sandbox's per-user uids start, well clear of the image's own users. */
const FIRST_UID = 20_000
/** How many uids it hands out before reusing the least recently used one. */
const UID_COUNT = 10_000

/**
 * Gives every user their own Linux uid (and a private group of the same number), so one user's server processes
 * can't read another's HOME, browser profile or temp files. Only possible while the sandbox runs as root (the image);
 * a uid is kept for its user while the sandbox runs, and only reused, least recently used first, once all are taken.
 */
export class UserIsolation {
  readonly #uids = new Map<string, number>()
  readonly #first: number
  readonly #count: number
  /** The group every server also gets, owning the shared package caches (SANDBOX_CACHE_DIR). */
  readonly cacheGid: number | undefined

  constructor(opts: { cacheGid?: number; first?: number; count?: number } = {}) {
    this.cacheGid = opts.cacheGid
    this.#first = opts.first ?? FIRST_UID
    this.#count = opts.count ?? UID_COUNT
  }

  /** On when running as root and not switched off; the caches' group comes from the cache folder. */
  static async create(opts: { enabled: boolean; cacheDir?: string }): Promise<UserIsolation | undefined> {
    if (!opts.enabled || process.getuid?.() !== 0) return undefined
    const cacheGid = opts.cacheDir
      ? await stat(opts.cacheDir).then(
          s => (s.gid === 0 ? undefined : s.gid),
          () => undefined
        )
      : undefined
    return new UserIsolation({ cacheGid })
  }

  /** The uid and private gid `user`'s servers run as. */
  runAs(user: string): RunAs {
    let uid = this.#uids.get(user)
    if (uid === undefined) {
      uid = this.#uids.size < this.#count ? this.#first + this.#uids.size : this.#reuse()
    } else {
      this.#uids.delete(user)
    }
    // Re-inserted, so the map's order is least recently used first.
    this.#uids.set(user, uid)
    return { uid, gid: uid }
  }

  #reuse(): number {
    const [oldest, uid] = this.#uids.entries().next().value as [string, number]
    this.#uids.delete(oldest)
    return uid
  }
}

/**
 * `command args` run as `runAs` through util-linux's `setpriv`: that uid and gid, the caches' group besides, every
 * capability dropped for good, and umask 002 so what it writes into the shared caches stays usable by the others.
 */
export function asUser(
  command: string,
  args: string[],
  runAs: RunAs,
  cacheGid: number | undefined
): { command: string; args: string[] } {
  return {
    command: "setpriv",
    args: [
      `--reuid=${runAs.uid}`,
      `--regid=${runAs.gid}`,
      cacheGid === undefined ? "--clear-groups" : `--groups=${cacheGid}`,
      "--inh-caps=-all",
      "--bounding-set=-all",
      "--no-new-privs",
      "--",
      "sh",
      "-c",
      'umask 002 && exec "$@"',
      "sh",
      command,
      ...args
    ]
  }
}
