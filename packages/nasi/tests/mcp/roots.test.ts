import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { expandRoots, mcpRoots, readOnlyRefusal } from "../../src/mcp/roots"
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
