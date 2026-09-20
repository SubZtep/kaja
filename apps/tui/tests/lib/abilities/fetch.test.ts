import { afterAll, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const base = mkdtempSync(join(tmpdir(), "kaja-fetch-"))
process.env.XDG_CACHE_HOME = join(base, "cache")
process.env.XDG_CONFIG_HOME = join(base, "config")

const { fetchMarketplace, getMarketplaceCacheDir, MarketplaceFetchError } = await import("../../../lib/abilities/fetch")
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
