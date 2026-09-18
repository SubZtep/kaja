import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createFolderPackageStore, scanHttpTools, scanMcpPackages, scanSkills } from "../../src/packages/folder-store"
import { SkillFileError } from "../../src/packages/types"

let root: string
let outside: string

function put(rel: string, content: string | Uint8Array) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function putSkill(name: string, description = `The ${name} skill.`, body = `Use ${name} well.`) {
  put(`skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nasi-packages-"))
  outside = mkdtempSync(join(tmpdir(), "nasi-packages-outside-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

test("a missing marketplace folder lists no skills", async () => {
  const store = createFolderPackageStore({ root: join(root, "nope"), enabled: { skills: ["pdf"] } })
  expect(await store.listSkills()).toEqual([])
})

test("an empty enabled list lists no skills, even with skills on disk", async () => {
  putSkill("pdf")
  const store = createFolderPackageStore({ root, enabled: { skills: [] } })
  expect(await store.listSkills()).toEqual([])
})

test("lists enabled skills with their folder and other files, skipping hidden and backup files", async () => {
  putSkill("pdf")
  put("skills/pdf/reference.md", "ref")
  put("skills/pdf/scripts/fill.py", "print(1)")
  put("skills/pdf/SKILL.md.bak", "old")
  put("skills/pdf/.env", "SECRET=1")
  putSkill("unlisted")

  const store = createFolderPackageStore({ root, enabled: { skills: ["pdf"] } })
  expect(await store.listSkills()).toEqual([
    {
      name: "pdf",
      description: "The pdf skill.",
      dir: join(root, "skills", "pdf"),
      files: ["reference.md", "scripts/fill.py"]
    }
  ])
})

test("skips broken and missing skills while the others still load", async () => {
  putSkill("good")
  put("skills/no-frontmatter/SKILL.md", "# nothing here")
  put("skills/wrong-name/SKILL.md", "---\nname: other\ndescription: x\n---\n")
  const store = createFolderPackageStore({
    root,
    enabled: { skills: ["no-frontmatter", "wrong-name", "missing", "../escape", "good"] }
  })
  expect((await store.listSkills()).map(s => s.name)).toEqual(["good"])
})

test("readSkill returns the body without frontmatter, and nothing for skills that aren't enabled", async () => {
  putSkill("pdf", "PDFs.", "Step one.")
  putSkill("other")
  const store = createFolderPackageStore({ root, enabled: { skills: ["pdf"] } })
  expect(await store.readSkill("pdf")).toBe("Step one.")
  expect(await store.readSkill("other")).toBeUndefined()
  expect(await store.readSkill("other", "SKILL.md")).toBeUndefined()
})

test("readSkill reads another file, falling back to a case-insensitive match", async () => {
  putSkill("pdf")
  put("skills/pdf/reference.md", "the reference")
  put("skills/pdf/scripts/fill.py", "print(1)")
  const store = createFolderPackageStore({ root, enabled: { skills: ["pdf"] } })
  expect(await store.readSkill("pdf", "reference.md")).toBe("the reference")
  expect(await store.readSkill("pdf", "REFERENCE.md")).toBe("the reference")
  expect(await store.readSkill("pdf", "Scripts/Fill.py")).toBe("print(1)")
  expect(await store.readSkill("pdf", "missing.md")).toBeUndefined()
})

test("readSkill refuses paths outside the skill folder", async () => {
  putSkill("pdf")
  putSkill("other")
  writeFileSync(join(outside, "secret.txt"), "nope")
  const store = createFolderPackageStore({ root, enabled: { skills: ["pdf"] } })
  await expect(store.readSkill("pdf", "../other/SKILL.md")).rejects.toThrow(SkillFileError)
  await expect(store.readSkill("pdf", join(outside, "secret.txt"))).rejects.toThrow(SkillFileError)
})

test("readSkill refuses a symlink that points outside the skill folder", async () => {
  putSkill("pdf")
  writeFileSync(join(outside, "secret.txt"), "nope")
  symlinkSync(join(outside, "secret.txt"), join(root, "skills", "pdf", "link.md"))
  const store = createFolderPackageStore({ root, enabled: { skills: ["pdf"] } })
  await expect(store.readSkill("pdf", "link.md")).rejects.toThrow(SkillFileError)
})

test("readSkill refuses binary files and hidden files", async () => {
  putSkill("pdf")
  put("skills/pdf/logo.png", new Uint8Array([0x89, 0x50, 0x00, 0x47]))
  put("skills/pdf/.env", "SECRET=1")
  const store = createFolderPackageStore({ root, enabled: { skills: ["pdf"] } })
  await expect(store.readSkill("pdf", "logo.png")).rejects.toThrow("binary")
  expect(await store.readSkill("pdf", ".env")).toBeUndefined()
})

test("scanSkills lists every skill folder, enabled or not, with descriptions or load errors", async () => {
  putSkill("pdf")
  put("skills/broken/SKILL.md", "---\nname: broken\n---\n")
  mkdirSync(join(root, "skills", "empty"), { recursive: true })
  mkdirSync(join(root, "skills", ".hidden"), { recursive: true })
  const entries = await scanSkills(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "empty", "pdf"])
  expect(entries[0]!.error).toContain("description")
  expect(entries[1]!.error).toContain("no SKILL.md")
  expect(entries[2]).toEqual({ name: "pdf", description: "The pdf skill." })
})

test("scanSkills on a missing folder is an empty list", async () => {
  expect(await scanSkills(join(root, "nope"))).toEqual([])
})

const manifest = (name: string, extra = "") => `name = "${name}"
description = "The ${name} API"
baseUrl = "https://api.${name}.test"
${extra}
[[tools]]
name = "${name.replaceAll("-", "_")}_get"
description = "Get something"
path = "/things"
`

test("listHttpTools reads enabled manifests and skips broken or mismatched ones", async () => {
  put("tools/good.toml", manifest("good"))
  put("tools/renamed.toml", manifest("other"))
  put("tools/broken.toml", 'name = "broken"\n')
  put("tools/off.toml", manifest("off"))
  const store = createFolderPackageStore({
    root,
    enabled: { skills: [], tools: ["good", "renamed", "broken", "missing", "../x"] }
  })
  expect((await store.listHttpTools()).map(p => p.name)).toEqual(["good"])
})

test("scanHttpTools lists every manifest with its domain and key need, or its error", async () => {
  put("tools/open.toml", manifest("open"))
  put("tools/keyed.toml", manifest("keyed", 'auth = { type = "apiKey", in = "header", name = "X-Key" }'))
  put("tools/broken.toml", "not = [valid")
  put("tools/.hidden.toml", manifest("hidden"))
  const entries = await scanHttpTools(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "keyed", "open"])
  expect(entries[0]!.error).toBeDefined()
  expect(entries[1]).toMatchObject({ domain: "api.keyed.test", auth: { in: "header", name: "X-Key" } })
  expect(entries[2]).toMatchObject({ domain: "api.open.test", auth: undefined })
})

test("listMcpPackages reads enabled manifests; scanMcpPackages shows the host or the command", async () => {
  put("mcp/docs.toml", 'name = "docs"\ndescription = "Docs"\nurl = "https://mcp.docs.test/mcp"\n')
  put(
    "mcp/browser.toml",
    'name = "browser"\ndescription = "Browser"\ntransport = "stdio"\ncommand = "bunx"\nargs = ["browser-mcp", "--headless"]\nauth = { type = "apiKey", in = "env", name = "B_KEY", optional = true }\n'
  )
  put("mcp/broken.toml", 'name = "broken"\ndescription = "x"\ntransport = "stdio"\n')
  const store = createFolderPackageStore({ root, enabled: { skills: [], mcp: ["docs", "broken", "missing"] } })
  expect((await store.listMcpPackages()).map(p => p.name)).toEqual(["docs"])

  const entries = await scanMcpPackages(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "browser", "docs"])
  expect(entries[0]!.error).toContain("command")
  expect(entries[1]).toMatchObject({
    transport: "stdio",
    command: "bunx browser-mcp --headless",
    auth: { in: "env", name: "B_KEY", optional: true }
  })
  expect(entries[2]).toMatchObject({ transport: "http", domain: "mcp.docs.test", auth: undefined })
})
