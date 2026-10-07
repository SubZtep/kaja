import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { expandRoots, mcpRoots } from "../../src/mcp/roots"
import { setWarnHandler } from "../../src/warn"

const dir = mkdtempSync(join(tmpdir(), "kaja-roots-"))
writeFileSync(join(dir, "file.txt"), "x")
afterAll(() => rmSync(dir, { recursive: true, force: true }))

test("~ is the home folder; relative paths, files and missing folders are left out with a warning", async () => {
  const warnings: unknown[] = []
  setWarnHandler((message, payload) => warnings.push({ message, root: payload?.root }))
  try {
    const roots = await expandRoots(["~", `${dir}/`, dir, "notes", join(dir, "file.txt"), join(dir, "gone")], {
      persona: "p"
    })
    expect(roots).toEqual([homedir(), dir])
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
  expect(mcpRoots(["/home/me/my notes"])).toEqual([{ uri: "file:///home/me/my%20notes", name: "my notes" }])
})
