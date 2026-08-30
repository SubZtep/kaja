import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openStore, setActiveStorePath } from "../../src/store"
import { setToolDeps } from "../../src/tools/deps"
import { guardWorkspacePath, PathDeniedError, PathEscapeError } from "../../src/tools/path-guard"

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

test("rejects reading the active nasi sqlite file", () => {
  const dbPath = join(root, "nasi.sqlite")
  openStore(dbPath)
  setActiveStorePath(dbPath)
  expect(() => guardWorkspacePath("nasi.sqlite")).toThrow(PathDeniedError)
})

test("allows a not-yet-existing path inside the workspace root (list_files on empty dir)", () => {
  mkdirSync(join(root, "empty"))
  expect(guardWorkspacePath("empty/new-subdir")).toBe(join(root, "empty/new-subdir"))
})
