import { afterEach, beforeEach, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { LOCK_FILE, readSyncLock, syncMarketplace } from "../../../lib/abilities/sync"

let upstream: string
let local: string

function put(root: string, rel: string, content: string) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

const read = (rel: string) => readFileSync(join(local, rel), "utf8")

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), "kaja-sync-"))
  upstream = join(base, "upstream")
  local = join(base, "local")
  mkdirSync(upstream)
})

afterEach(() => {
  rmSync(dirname(upstream), { recursive: true, force: true })
})

test("first sync copies everything into a missing folder and writes the lock", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  put(upstream, "README.md", "readme")
  const report = await syncMarketplace(upstream, local, { url: "u", ref: "main", commit: "c1" })
  expect(report.added.sort()).toEqual(["README.md", "abilities/a/SKILL.md"])
  expect(read("abilities/a/SKILL.md")).toBe("a1")
  const lock = await readSyncLock(local)
  expect(lock?.source).toEqual({ url: "u", ref: "main", commit: "c1" })
  expect(Object.keys(lock!.files).sort()).toEqual(["README.md", "abilities/a/SKILL.md"])
})

test("an untouched file follows upstream without a backup", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  await syncMarketplace(upstream, local)
  put(upstream, "abilities/a/SKILL.md", "a2")
  const report = await syncMarketplace(upstream, local)
  expect(report.updated).toEqual(["abilities/a/SKILL.md"])
  expect(read("abilities/a/SKILL.md")).toBe("a2")
  expect(existsSync(join(local, "abilities/a/SKILL.bak.md"))).toBe(false)
})

test("unchanged files are reported as nothing", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  await syncMarketplace(upstream, local)
  expect(await syncMarketplace(upstream, local)).toEqual({
    added: [],
    updated: [],
    backedUp: [],
    removed: [],
    kept: []
  })
})

test("an edited file is replaced by upstream and backed up, then .bak.2 on the next conflict", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  await syncMarketplace(upstream, local)

  put(local, "abilities/a/SKILL.md", "mine")
  put(upstream, "abilities/a/SKILL.md", "a2")
  const first = await syncMarketplace(upstream, local)
  expect(first.backedUp).toEqual([{ path: "abilities/a/SKILL.md", backup: "abilities/a/SKILL.bak.md" }])
  expect(read("abilities/a/SKILL.md")).toBe("a2")
  expect(read("abilities/a/SKILL.bak.md")).toBe("mine")

  put(local, "abilities/a/SKILL.md", "mine again")
  put(upstream, "abilities/a/SKILL.md", "a3")
  const second = await syncMarketplace(upstream, local)
  expect(second.backedUp[0]?.backup).toBe("abilities/a/SKILL.bak.2.md")
  expect(read("abilities/a/SKILL.bak.2.md")).toBe("mine again")
})

test("an edit that already matches upstream needs no backup", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  await syncMarketplace(upstream, local)
  put(local, "abilities/a/SKILL.md", "a2")
  put(upstream, "abilities/a/SKILL.md", "a2")
  const report = await syncMarketplace(upstream, local)
  expect(report.backedUp).toEqual([])
  expect(report.updated).toEqual([])
})

test("your own file that upstream later adds at the same path is backed up and replaced", async () => {
  put(local, "abilities/a/SKILL.md", "mine")
  put(upstream, "abilities/a/SKILL.md", "upstream")
  const report = await syncMarketplace(upstream, local)
  expect(report.backedUp).toEqual([{ path: "abilities/a/SKILL.md", backup: "abilities/a/SKILL.bak.md" }])
  expect(read("abilities/a/SKILL.md")).toBe("upstream")
})

test("an untouched file removed upstream is deleted, with its now-empty folders", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  put(upstream, "abilities/b/SKILL.md", "b1")
  await syncMarketplace(upstream, local)
  rmSync(join(upstream, "abilities/b"), { recursive: true })
  const report = await syncMarketplace(upstream, local)
  expect(report.removed).toEqual(["abilities/b/SKILL.md"])
  expect(existsSync(join(local, "abilities/b"))).toBe(false)
  expect(existsSync(join(local, "abilities/a/SKILL.md"))).toBe(true)
})

test("an edited file removed upstream stays and becomes your own", async () => {
  put(upstream, "abilities/b/SKILL.md", "b1")
  await syncMarketplace(upstream, local)
  put(local, "abilities/b/SKILL.md", "mine")
  rmSync(join(upstream, "abilities/b"), { recursive: true })
  const report = await syncMarketplace(upstream, local)
  expect(report.kept).toEqual(["abilities/b/SKILL.md"])
  expect(read("abilities/b/SKILL.md")).toBe("mine")
  expect((await readSyncLock(local))!.files["abilities/b/SKILL.md"]).toBeUndefined()
  // No longer tracked, so a later sync leaves it alone for good.
  expect((await syncMarketplace(upstream, local)).kept).toEqual([])
})

test("your own files are never touched", async () => {
  put(upstream, "abilities/a/SKILL.md", "a1")
  put(local, "abilities/mine/SKILL.md", "my skill")
  await syncMarketplace(upstream, local)
  put(upstream, "abilities/a/SKILL.md", "a2")
  const report = await syncMarketplace(upstream, local)
  expect(report.updated).toEqual(["abilities/a/SKILL.md"])
  expect(read("abilities/mine/SKILL.md")).toBe("my skill")
})

test("keeps a script's exec bit", async () => {
  put(upstream, "abilities/a/scripts/run.sh", "#!/bin/sh\necho hi\n")
  chmodSync(join(upstream, "abilities/a/scripts/run.sh"), 0o755)
  await syncMarketplace(upstream, local)
  expect(statSync(join(local, "abilities/a/scripts/run.sh")).mode & 0o777).toBe(0o755)
})

test("dot-entries upstream (.git) are not synced, and the lock file is hidden", async () => {
  put(upstream, ".git/HEAD", "ref")
  put(upstream, "abilities/a/SKILL.md", "a1")
  await syncMarketplace(upstream, local)
  expect(existsSync(join(local, ".git"))).toBe(false)
  expect(existsSync(join(local, LOCK_FILE))).toBe(true)
})
