import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setToolDeps } from "../../src/tools/deps"
import {
  guardWorkspacePath,
  hiddenPathApproval,
  PathDeniedError,
  PathEscapeError,
  resolveWorkspacePath
} from "../../src/tools/path-guard"

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
  expect(resolveWorkspacePath("in.png")).toEqual({ path: join(root, "in.png"), inWorkspace: true, hidden: false })
  expect(resolveWorkspacePath(join(outside, "out.png"))).toMatchObject({
    path: join(outside, "out.png"),
    inWorkspace: false
  })
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

test("credential files and folders are refused wherever they are", () => {
  for (const path of [
    ".ssh/id_ed25519",
    ".aws/credentials",
    ".gnupg/private-keys-v1.d/key",
    ".config/gh/hosts.yml",
    ".kube/config",
    ".docker/config.json",
    ".netrc",
    ".env",
    ".env.local",
    "app/.env.production"
  ]) {
    mkdirSync(join(root, path, ".."), { recursive: true })
    writeFileSync(join(root, path), "")
    expect(() => resolveWorkspacePath(path)).toThrow(PathDeniedError)
  }
  // Listing the folder itself is refused too
  expect(() => resolveWorkspacePath(".ssh")).toThrow(PathDeniedError)
})

test("an .env example and a project's own .docker folder stay readable", () => {
  writeFileSync(join(root, ".env.example"), "")
  mkdirSync(join(root, ".docker"))
  writeFileSync(join(root, ".docker", "Dockerfile"), "")
  expect(resolveWorkspacePath(".env.example").inWorkspace).toBe(true)
  expect(resolveWorkspacePath(".docker/Dockerfile").inWorkspace).toBe(true)
})

test("a dotfile or anything in a dot-folder below the root is hidden; the root's own dots don't count", () => {
  const dotted = mkdtempSync(join(tmpdir(), ".nasi-guard-dotted-"))
  setToolDeps({ workspaceRoot: dotted })
  try {
    writeFileSync(join(dotted, "plain.txt"), "")
    mkdirSync(join(dotted, ".github"))
    writeFileSync(join(dotted, ".github", "ci.yaml"), "")
    writeFileSync(join(dotted, ".bashrc"), "")
    expect(resolveWorkspacePath("plain.txt").hidden).toBe(false)
    expect(resolveWorkspacePath(".github/ci.yaml").hidden).toBe(true)
    expect(resolveWorkspacePath(".bashrc").hidden).toBe(true)
  } finally {
    rmSync(dotted, { recursive: true, force: true })
  }
})

test("hiddenPathApproval asks only for a hidden path inside the workspace", () => {
  writeFileSync(join(root, ".bashrc"), "")
  writeFileSync(join(root, "plain.txt"), "")
  writeFileSync(join(outside, ".profile"), "")
  writeFileSync(join(root, ".env"), "")
  expect(hiddenPathApproval("Read", ".bashrc")).toBe("Read .bashrc (a hidden file or folder)")
  expect(hiddenPathApproval("Read", "plain.txt")).toBeUndefined()
  // Refused anyway: outside the workspace, or a credential
  expect(hiddenPathApproval("Read", join(outside, ".profile"))).toBeUndefined()
  expect(hiddenPathApproval("Read", ".env")).toBeUndefined()
  expect(hiddenPathApproval("Read", 42)).toBeUndefined()
})
