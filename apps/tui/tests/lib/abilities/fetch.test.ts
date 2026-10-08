import { afterAll, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const base = mkdtempSync(join(tmpdir(), "kaja-fetch-"))
process.env.XDG_CACHE_HOME = join(base, "cache")
process.env.XDG_CONFIG_HOME = join(base, "config")

const { fetchMarketplace, getMarketplaceCacheDir } = await import("../../../lib/abilities/fetch")
const { runAbilityUpdate, UPDATE_STEPS } = await import("../../../lib/abilities/cli")
const { getMarketplaceDir } = await import("../../../lib/abilities/abilities-file")

function put(root: string, rel: string, content: string) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

/** A marketplace folder (the layout of a marketplace repo), plus a file outside the marketplace folders. */
function makeSource(name: string, skillBody = "v1") {
  const dir = join(base, name)
  put(dir, "abilities/demo/SKILL.md", `---\ndescription: Demo.\n---\n${skillBody}\n`)
  put(dir, ".github/workflows/ci.yaml", "not part of the marketplace")
  return dir
}

beforeEach(() => {
  rmSync(getMarketplaceCacheDir(), { recursive: true, force: true })
  rmSync(join(base, "config"), { recursive: true, force: true })
})

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
})

test("merges folder sources into the cache, later ones winning, and keeps only the marketplace folders", async () => {
  const first = makeSource("first", "from first")
  const second = makeSource("second", "from second")
  put(first, "personas/only-first.toml", 'label = "F"\n')
  const { dir, sources } = await fetchMarketplace([first, second])
  expect(sources).toEqual([{ source: first }, { source: second }])
  expect(readFileSync(join(dir, "abilities/demo/SKILL.md"), "utf8")).toContain("from second")
  expect(existsSync(join(dir, "personas/only-first.toml"))).toBe(true)
  expect(existsSync(join(dir, ".github"))).toBe(false)
})

test("a bad source fails without touching the last good cache", async () => {
  const { dir } = await fetchMarketplace([makeSource("good")])
  await expect(fetchMarketplace([join(base, "no-such-folder")])).rejects.toThrow("doesn't exist")
  await expect(fetchMarketplace(["not a repo"])).rejects.toThrow("not owner/repo")
  expect(existsSync(join(dir, "abilities/demo/SKILL.md"))).toBe(true)
})

test("kaja abilities update syncs from settings.toml's [marketplace] sources into the marketplace folder", async () => {
  const source = makeSource("repo-f")
  put(dirname(getMarketplaceDir()), "settings.toml", `[marketplace]\nsources = ["${source}"]\n`)
  let steps = 0
  const first = await runAbilityUpdate(() => steps++)
  expect(first.code).toBe(0)
  // Every step reported, so the progress bar ends full
  expect(steps).toBe(UPDATE_STEPS)
  expect(first.text).toContain(`synced from ${source}`)
  // A count, not a line per file: the progress bar already showed them arrive
  expect(first.text).toContain("1 added")
  expect(first.text).not.toContain("abilities/demo/SKILL.md")
  expect(readFileSync(join(getMarketplaceDir(), "abilities/demo/SKILL.md"), "utf8")).toContain("v1")

  steps = 0
  const again = await runAbilityUpdate(() => steps++)
  expect(again.code).toBe(0)
  expect(steps).toBe(UPDATE_STEPS)
  expect(again.text).toContain("up to date")
})

test("kaja abilities update reports a fetch failure with exit code 1", async () => {
  put(dirname(getMarketplaceDir()), "settings.toml", `[marketplace]\nsources = ["${join(base, "no-such-repo")}"]\n`)
  const result = await runAbilityUpdate()
  expect(result.code).toBe(1)
  expect(result.text).toContain("Could not fetch the marketplace")
})
