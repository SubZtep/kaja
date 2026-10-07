import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { backupFiles, backupPaths, expandRoots, listBackups, mcpRoots, readOnlyRefusal } from "../../src/mcp/roots"
import { setWarnHandler } from "../../src/warn"

// Real paths, as expandRoots gives them (a temp dir can sit behind a symlink).
const dir = realpathSync(mkdtempSync(join(tmpdir(), "kaja-roots-")))
writeFileSync(join(dir, "file.txt"), "x")
afterAll(() => rmSync(dir, { recursive: true, force: true }))

test("~ is the home folder; relative paths, files and missing folders are left out with a warning", async () => {
  const warnings: unknown[] = []
  setWarnHandler((message, payload) => warnings.push({ message, root: payload?.root }))
  try {
    const roots = await expandRoots(
      ["~", `${dir}/`, { path: dir, readOnly: true }, "notes", join(dir, "file.txt"), join(dir, "gone")],
      { persona: "p" }
    )
    expect(roots).toEqual([
      { folder: realpathSync(homedir()), readOnly: false },
      { folder: dir, readOnly: false }
    ])
    expect(warnings).toEqual([
      { message: "Root left out: not an absolute path or ~/…", root: "notes" },
      { message: "Root left out: no such folder", root: join(dir, "file.txt") },
      { message: "Root left out: no such folder", root: join(dir, "gone") }
    ])
  } finally {
    setWarnHandler(() => {})
  }
})

test("~/… is under the home folder, and roots are file URLs named after their folder", async () => {
  expect(await expandRoots(["~/kaja-no-such-folder"], {})).toEqual([])
  expect(mcpRoots([{ folder: "/home/me/my notes", readOnly: true }])).toEqual([
    { uri: "file:///home/me/my%20notes", name: "my notes" }
  ])
})

test("a write into a read-only folder is refused; the nearest root decides, through symlinks and new paths", () => {
  const site = join(dir, "site")
  const drafts = join(site, "drafts")
  const notes = join(dir, "notes")
  mkdirSync(drafts, { recursive: true })
  mkdirSync(notes, { recursive: true })
  symlinkSync(site, join(notes, "to-site"))
  const roots = [
    { folder: site, readOnly: true },
    { folder: drafts, readOnly: false },
    { folder: notes, readOnly: false }
  ]
  const refused = (args: Record<string, unknown>) => readOnlyRefusal(roots, ["path", "source", "destination"], args)

  expect(refused({ path: join(site, "index.html") })).toContain("read-only for this persona")
  expect(refused({ path: join(site, "new", "deep.txt") })).toContain("read-only")
  expect(refused({ path: join(drafts, "post.md") })).toBeUndefined()
  expect(refused({ path: join(notes, "to-site", "index.html") })).toContain("read-only")
  expect(refused({ source: join(site, "a"), destination: join(notes, "a") })).toContain("read-only")
  expect(refused({ path: "notes/a.md" })).toContain("absolute path")
  expect(refused({ content: join(site, "x") })).toBeUndefined()
  expect(readOnlyRefusal([{ folder: notes, readOnly: false }], ["path"], { path: "relative.md" })).toBeUndefined()
})

test("backups: only existing paths in a backed-up root count, and each copy lands under its own path by time", async () => {
  const kept = join(dir, "kept")
  const inner = join(kept, "inner")
  mkdirSync(inner, { recursive: true })
  writeFileSync(join(kept, "a.txt"), "one")
  writeFileSync(join(inner, "b.txt"), "two")
  const roots = [
    { folder: kept, readOnly: false, backup: true },
    { folder: inner, readOnly: false }
  ]
  const paths = (args: Record<string, unknown>) => backupPaths(roots, ["path", "source"], args)

  expect(paths({ path: join(kept, "a.txt") })).toEqual([join(kept, "a.txt")])
  // The nearest root decides: a folder without backup inside a backed-up one isn't backed up.
  expect(paths({ path: join(inner, "b.txt") })).toEqual([])
  expect(paths({ path: "a.txt", source: [join(kept, "a.txt")] })).toEqual([join(kept, "a.txt")])
  expect(backupPaths([{ folder: kept, readOnly: false }], ["path"], { path: join(kept, "a.txt") })).toEqual([])
  expect(readOnlyRefusal(roots, ["path"], { path: "a.txt" })).toContain("absolute path")

  const backups = join(dir, "backups")
  const [first] = await backupFiles([join(kept, "a.txt"), join(kept, "gone.txt")], backups)
  await backupFiles([join(kept, "a.txt")], backups)
  expect(readFileSync(first!, "utf8")).toBe("one")
  const versions = await listBackups(backups, join(kept, "a.txt"))
  expect(versions).toHaveLength(2)
  expect(versions[0]! > versions[1]!).toBe(true)
  expect(await listBackups(backups, join(kept, "gone.txt"))).toEqual([])
})
