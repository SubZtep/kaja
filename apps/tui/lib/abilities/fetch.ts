import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import type { AbilitiesSource } from "@kaja/schema/config"
import { t } from "../i18n"
import { getPaths } from "../paths"

/** The repo folder that holds the marketplace, the only path the sparse checkout pulls down. */
const MARKETPLACE_PATH = "marketplace"
const GIT_TIMEOUT_MS = 120_000
/** The oldest git with `clone --sparse` and `sparse-checkout`, which the marketplace checkout relies on. */
export const MIN_GIT_VERSION = "2.25"

/** A fetch problem worth showing the user as-is (git missing, network, no marketplace folder). */
export class MarketplaceFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MarketplaceFetchError"
  }
}

/** A sparse git checkout of the source repo, kept between updates so only changes are fetched. */
export function getMarketplaceCacheDir() {
  return join(getPaths().cache, "marketplace-repo")
}

async function git(args: string[], cwd?: string): Promise<string> {
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      // Never hang on a credential prompt: a private or mistyped URL should fail, not wait for input.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
    })
  } catch {
    throw new MarketplaceFetchError(t("ability.gitMissing"))
  }
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, GIT_TIMEOUT_MS)
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited
  ])
  clearTimeout(timer)
  const command = `git ${args[0]}`
  if (timedOut) throw new MarketplaceFetchError(t("ability.gitTimeout", { command }))
  if (code !== 0)
    throw new MarketplaceFetchError(t("ability.gitFailed", { command, message: stderr.trim() || `exit ${code}` }))
  return stdout.trim()
}

/** The `major.minor.patch` numbers in `git --version` output ("git version 2.39.3 (Apple Git-145)"), or undefined. */
export function parseGitVersion(output: string): number[] | undefined {
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(output)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : undefined
}

function atLeast(version: number[], min: string) {
  const [major = 0, minor = 0] = min.split(".").map(Number)
  return version[0]! > major || (version[0] === major && version[1]! >= minor)
}

/** Whether the host has a git new enough for the marketplace checkout: its version, or why not. */
export async function checkGit(
  run: (args: string[]) => Promise<string> = args => git(args)
): Promise<{ ok: true; version?: string } | { ok: false; reason: string }> {
  let output: string
  try {
    output = await run(["--version"])
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
  const version = parseGitVersion(output)
  // An output we can't read (a vendor build) isn't proof it is too old, so let the real command decide.
  if (!version) return { ok: true }
  const text = version.join(".")
  if (!atLeast(version, MIN_GIT_VERSION))
    return { ok: false, reason: t("ability.gitTooOld", { version: text, min: MIN_GIT_VERSION }) }
  return { ok: true, version: text }
}

/**
 * Brings the cache up to date with `source` (cloning on first use, or when the URL changed)
 * and returns the fetched marketplace folder with the commit it came from. Only this and
 * `kaja abilities` touch the network — never startup.
 */
export async function fetchMarketplace(source: Required<AbilitiesSource>): Promise<{ dir: string; commit: string }> {
  const gitCheck = await checkGit()
  if (!gitCheck.ok) throw new MarketplaceFetchError(gitCheck.reason)

  const cache = getMarketplaceCacheDir()
  const origin = existsSync(join(cache, ".git"))
    ? await git(["remote", "get-url", "origin"], cache).catch(() => undefined)
    : undefined

  if (origin === source.url) {
    await git(["fetch", "--depth", "1", "origin", source.ref], cache)
    await git(["reset", "--hard", "FETCH_HEAD"], cache)
  } else {
    await rm(cache, { recursive: true, force: true })
    await git([
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--branch",
      source.ref,
      "--",
      source.url,
      cache
    ])
    await git(["sparse-checkout", "set", MARKETPLACE_PATH], cache)
  }

  const dir = join(cache, MARKETPLACE_PATH)
  if (!existsSync(dir)) throw new MarketplaceFetchError(t("ability.noMarketplaceFolder", source))
  return { dir, commit: await git(["rev-parse", "HEAD"], cache) }
}
