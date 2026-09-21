import { afterAll, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const base = mkdtempSync(join(tmpdir(), "kaja-fetch-"))
process.env.XDG_CACHE_HOME = join(base, "cache")
process.env.XDG_CONFIG_HOME = join(base, "config")

const { checkGit, fetchMarketplace, getMarketplaceCacheDir, MarketplaceFetchError, MIN_GIT_VERSION, parseGitVersion } =
  await import("../../../lib/abilities/fetch")
const { runAbilityUpdate } = await import("../../../lib/abilities/cli")
const { getMarketplaceDir, getAbilitiesPath } = await import("../../../lib/abilities/abilities-file")

function git(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString())
  return proc.stdout.toString().trim()
}

function put(root: string, rel: string, content: string) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** A repo with a marketplace/ folder plus unrelated files the sparse checkout must leave out. */
function makeRepo(name: string, skillBody = "v1") {
  const repo = join(base, name)
  mkdirSync(repo, { recursive: true })
  git(repo, "init", "-q", "-b", "main")
  put(repo, "marketplace/skills/demo/SKILL.md", `---\nname: demo\ndescription: Demo.\n---\n${skillBody}\n`)
  put(repo, "apps/big-file.txt", "not part of the marketplace")
  git(repo, "add", ".")
  git(repo, "commit", "-q", "-m", "init")
  return repo
}

beforeEach(() => {
  rmSync(getMarketplaceCacheDir(), { recursive: true, force: true })
  rmSync(join(base, "config"), { recursive: true, force: true })
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

test("clones only the marketplace folder and reports the commit", async () => {
  const repo = makeRepo("repo-a")
  const { dir, commit } = await fetchMarketplace({ url: repo, ref: "main" })
  expect(readFileSync(join(dir, "skills/demo/SKILL.md"), "utf8")).toContain("v1")
  expect(existsSync(join(getMarketplaceCacheDir(), "apps"))).toBe(false)
  expect(commit).toBe(git(repo, "rev-parse", "HEAD"))
})

test("a second fetch picks up new commits", async () => {
  const repo = makeRepo("repo-b")
  await fetchMarketplace({ url: repo, ref: "main" })
  put(repo, "marketplace/skills/demo/SKILL.md", "---\nname: demo\ndescription: Demo.\n---\nv2\n")
  git(repo, "commit", "-q", "-am", "v2")
  const { dir, commit } = await fetchMarketplace({ url: repo, ref: "main" })
  expect(readFileSync(join(dir, "skills/demo/SKILL.md"), "utf8")).toContain("v2")
  expect(commit).toBe(git(repo, "rev-parse", "HEAD"))
})

test("a different URL re-clones from the new source", async () => {
  await fetchMarketplace({ url: makeRepo("repo-c", "from c"), ref: "main" })
  const { dir } = await fetchMarketplace({ url: makeRepo("repo-d", "from d"), ref: "main" })
  expect(readFileSync(join(dir, "skills/demo/SKILL.md"), "utf8")).toContain("from d")
})

test("a missing branch or marketplace folder is a readable error", async () => {
  const repo = makeRepo("repo-e")
  await expect(fetchMarketplace({ url: repo, ref: "nope" })).rejects.toThrow(MarketplaceFetchError)

  const empty = join(base, "repo-empty")
  mkdirSync(empty)
  git(empty, "init", "-q", "-b", "main")
  put(empty, "README.md", "no marketplace here")
  git(empty, "add", ".")
  git(empty, "commit", "-q", "-m", "init")
  await expect(fetchMarketplace({ url: empty, ref: "main" })).rejects.toThrow("marketplace/")
})

test("kaja abilities update syncs from abilities.toml's [source] into the marketplace folder", async () => {
  const repo = makeRepo("repo-f")
  put(dirname(getAbilitiesPath()), "abilities.toml", `skills = []\n\n[source]\nurl = "${repo}"\n`)
  const first = await runAbilityUpdate()
  expect(first.code).toBe(0)
  expect(first.text).toContain("skills/demo/SKILL.md")
  expect(readFileSync(join(getMarketplaceDir(), "skills/demo/SKILL.md"), "utf8")).toContain("v1")

  const again = await runAbilityUpdate()
  expect(again.code).toBe(0)
  expect(again.text).toContain("up to date")
})

test("kaja abilities update reports a fetch failure with exit code 1", async () => {
  put(dirname(getAbilitiesPath()), "abilities.toml", `[source]\nurl = "${join(base, "no-such-repo")}"\n`)
  const result = await runAbilityUpdate()
  expect(result.code).toBe(1)
  expect(result.text).toContain("Could not fetch the marketplace")
})

test("reads the version out of git's own wording, vendor suffixes included", () => {
  expect(parseGitVersion("git version 2.39.3 (Apple Git-145)")).toEqual([2, 39, 3])
  expect(parseGitVersion("git version 2.43.0.windows.1")).toEqual([2, 43, 0])
  expect(parseGitVersion("git version 2.25")).toEqual([2, 25, 0])
  expect(parseGitVersion("no digits here")).toBeUndefined()
})

test("a git older than the sparse checkout needs is refused with the versions named", async () => {
  const old = await checkGit(async () => "git version 2.24.9")
  expect(old).toMatchObject({ ok: false })
  expect(old.ok === false && old.reason).toContain("2.24.9")
  expect(old.ok === false && old.reason).toContain(MIN_GIT_VERSION)
  expect(await checkGit(async () => "git version 1.9.1")).toMatchObject({ ok: false })
})

test("the minimum, newer releases and a new major all pass", async () => {
  expect(await checkGit(async () => "git version 2.25.0")).toEqual({ ok: true, version: "2.25.0" })
  expect(await checkGit(async () => "git version 2.55.0")).toEqual({ ok: true, version: "2.55.0" })
  expect(await checkGit(async () => "git version 3.0.0")).toEqual({ ok: true, version: "3.0.0" })
})

test("a missing git reports the run's own error, and an unreadable version is not held against it", async () => {
  const missing = await checkGit(async () => {
    throw new MarketplaceFetchError("git is not installed")
  })
  expect(missing).toEqual({ ok: false, reason: "git is not installed" })
  expect(await checkGit(async () => "git something else")).toEqual({ ok: true })
})

test("the real git on this machine passes", async () => {
  expect(await checkGit()).toMatchObject({ ok: true })
})
