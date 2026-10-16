import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setToolDeps } from "../../src/tools/deps"
import { guardWorkspacePath, PathDeniedError, PathEscapeError, resolveWorkspacePath } from "../../src/tools/path-guard"

let root: string
let outside: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nasi-guard-root-"))
  outside = mkdtempSync(join(tmpdir(), "nasi-guard-outside-"))
  setToolDeps({ workspaceRoot: root })
})

afterEach(() => {
  setToolDeps({})
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

test("allows a path inside the workspace root", () => {
  writeFileSync(join(root, "ok.txt"), "hi")
  expect(guardWorkspacePath("ok.txt")).toBe(join(root, "ok.txt"))
})

test("rejects a relative .. escape", () => {
  writeFileSync(join(outside, "secret.txt"), "nope")
  expect(() => guardWorkspacePath(`../${join(outside, "secret.txt")}`)).toThrow(PathEscapeError)
})

test("rejects an absolute path outside the workspace root", () => {
  writeFileSync(join(outside, "secret.txt"), "nope")
  expect(() => guardWorkspacePath(join(outside, "secret.txt"))).toThrow(PathEscapeError)
})

test("rejects a symlink that escapes the workspace root", () => {
  writeFileSync(join(outside, "secret.txt"), "nope")
  const link = join(root, "link.txt")
  symlinkSync(join(outside, "secret.txt"), link)
  expect(() => guardWorkspacePath("link.txt")).toThrow(PathEscapeError)
})

test("rejects secrets.toml by filename even inside the workspace root", () => {
  writeFileSync(join(root, "secrets.toml"), "token = 'x'")
  expect(() => guardWorkspacePath("secrets.toml")).toThrow(PathDeniedError)
})

test("rejects reading the configured sqlite file", () => {
  const dbPath = join(root, "nasi.sqlite")
  writeFileSync(dbPath, "")
  setToolDeps({ workspaceRoot: root, storePath: dbPath })
  expect(() => guardWorkspacePath("nasi.sqlite")).toThrow(PathDeniedError)
})

test("allows a not-yet-existing path inside the workspace root (list_files on empty dir)", () => {
  mkdirSync(join(root, "empty"))
  expect(guardWorkspacePath("empty/new-subdir")).toBe(join(root, "empty/new-subdir"))
})

test("resolveWorkspacePath tells inside from outside instead of throwing", () => {
  writeFileSync(join(root, "in.png"), "")
  writeFileSync(join(outside, "out.png"), "")
  expect(resolveWorkspacePath("in.png")).toEqual({ path: join(root, "in.png"), inWorkspace: true })
  expect(resolveWorkspacePath(join(outside, "out.png"))).toEqual({ path: join(outside, "out.png"), inWorkspace: false })
})

test("secrets.toml and the sqlite file with its siblings are refused outside the workspace too", () => {
  const dbPath = join(outside, "memory.sqlite")
  setToolDeps({ workspaceRoot: root, storePath: dbPath })
  writeFileSync(join(outside, "secrets.toml"), "")
  for (const name of ["secrets.toml", "memory.sqlite", "memory.sqlite-wal", "memory.sqlite-shm"]) {
    writeFileSync(join(outside, name), "")
    expect(() => resolveWorkspacePath(join(outside, name))).toThrow(PathDeniedError)
  }
})
