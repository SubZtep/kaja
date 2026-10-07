import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  createFolderAbilityStore,
  parseDatasetManifest,
  parseHttpToolManifest,
  parsePersonaManifest,
  readDatasets,
  readPersonas,
  readSkillBundle,
  scanCodeTools,
  scanDatasets,
  scanHttpTools,
  scanMcpAbilities,
  scanPersonas,
  scanSkills
} from "../../src/abilities/folder-store"
import { SkillFileError } from "../../src/abilities/types"

let root: string
let outside: string

function put(rel: string, content: string | Uint8Array) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function putSkill(name: string, description = `The ${name} skill.`, body = `Use ${name} well.`) {
  put(`abilities/${name}/SKILL.md`, `---\ndescription: ${description}\n---\n${body}\n`)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nasi-abilities-"))
  outside = mkdtempSync(join(tmpdir(), "nasi-abilities-outside-"))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

test("a missing marketplace folder lists nothing", async () => {
  const store = createFolderAbilityStore({ root: join(root, "nope") })
  expect(await store.listSkills()).toEqual([])
  expect(await store.listHttpTools()).toEqual([])
  expect(await store.listMcpAbilities()).toEqual([])
})

test("lists every skill with their folder and other files, skipping hidden and backup files", async () => {
  putSkill("pdf")
  put("abilities/pdf/reference.md", "ref")
  put("abilities/pdf/scripts/fill.py", "print(1)")
  put("abilities/pdf/SKILL.bak.md", "old")
  put("abilities/pdf/scripts/fill.bak.2.py", "old")
  put("abilities/pdf/scripts/run.bak", "old")
  put("abilities/pdf/.env", "SECRET=1")

  const store = createFolderAbilityStore({ root })
  expect(await store.listSkills()).toEqual([
    {
      name: "pdf",
      description: "The pdf skill.",
      dir: join(root, "abilities", "pdf"),
      files: ["reference.md", "scripts/fill.py"]
    }
  ])
})

test("skips broken skills while the others still load", async () => {
  putSkill("good")
  put("abilities/no-frontmatter/SKILL.md", "# nothing here")
  put("abilities/named/SKILL.md", "---\nname: named\ndescription: x\n---\n")
  const store = createFolderAbilityStore({ root })
  expect((await store.listSkills()).map(s => s.name)).toEqual(["good"])
})

test("readSkill returns the body without frontmatter, and nothing for a folder without a skill", async () => {
  putSkill("pdf", "PDFs.", "Step one.")
  put("abilities/api/tool.toml", "x")
  const store = createFolderAbilityStore({ root })
  expect(await store.readSkill("pdf")).toBe("Step one.")
  expect(await store.readSkill("api")).toBeUndefined()
  expect(await store.readSkill("api", "tool.toml")).toBeUndefined()
  expect(await store.readSkill("missing")).toBeUndefined()
})

test("readSkill reads another file, falling back to a case-insensitive match", async () => {
  putSkill("pdf")
  put("abilities/pdf/reference.md", "the reference")
  put("abilities/pdf/scripts/fill.py", "print(1)")
  const store = createFolderAbilityStore({ root })
  expect(await store.readSkill("pdf", "reference.md")).toBe("the reference")
  expect(await store.readSkill("pdf", "REFERENCE.md")).toBe("the reference")
  expect(await store.readSkill("pdf", "Scripts/Fill.py")).toBe("print(1)")
  expect(await store.readSkill("pdf", "missing.md")).toBeUndefined()
})

test("readSkill refuses paths outside the skill folder", async () => {
  putSkill("pdf")
  putSkill("other")
  writeFileSync(join(outside, "secret.txt"), "nope")
  const store = createFolderAbilityStore({ root })
  await expect(store.readSkill("pdf", "../other/SKILL.md")).rejects.toThrow(SkillFileError)
  await expect(store.readSkill("pdf", join(outside, "secret.txt"))).rejects.toThrow(SkillFileError)
})

test("readSkill refuses a symlink that points outside the skill folder", async () => {
  putSkill("pdf")
  writeFileSync(join(outside, "secret.txt"), "nope")
  symlinkSync(join(outside, "secret.txt"), join(root, "abilities", "pdf", "link.md"))
  const store = createFolderAbilityStore({ root })
  await expect(store.readSkill("pdf", "link.md")).rejects.toThrow(SkillFileError)
})

test("readSkill refuses binary files and hidden files", async () => {
  putSkill("pdf")
  put("abilities/pdf/logo.png", new Uint8Array([0x89, 0x50, 0x00, 0x47]))
  put("abilities/pdf/.env", "SECRET=1")
  const store = createFolderAbilityStore({ root })
  await expect(store.readSkill("pdf", "logo.png")).rejects.toThrow("binary")
  expect(await store.readSkill("pdf", ".env")).toBeUndefined()
})

test("scanSkills lists every skill folder, enabled or not, with descriptions or load errors", async () => {
  putSkill("pdf")
  put("abilities/broken/SKILL.md", "---\nlicense: MIT\n---\n")
  mkdirSync(join(root, "abilities", "empty"), { recursive: true })
  mkdirSync(join(root, "abilities", ".hidden"), { recursive: true })
  const entries = await scanSkills(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "empty", "pdf"])
  expect(entries[0]!.error).toContain("description")
  expect(entries[1]!.error).toContain("no SKILL.md")
  expect(entries[2]).toEqual({ name: "pdf", description: "The pdf skill." })
})

test("scanSkills on a missing folder is an empty list", async () => {
  expect(await scanSkills(join(root, "nope"))).toEqual([])
})

const manifest = (name: string, extra = "") => `description = "The ${name} API"
baseUrl = "https://api.${name}.test"
${extra}
[[tools]]
name = "${name.replaceAll("-", "_")}_get"
description = "Get something"
path = "/things"
`

test("listHttpTools reads every manifest and skips broken or named ones", async () => {
  put("abilities/good/tool.toml", manifest("good"))
  put("abilities/renamed/tool.toml", `name = "renamed"\n${manifest("renamed")}`)
  put("abilities/broken/tool.toml", 'description = "broken"\n')
  put("abilities/also/tool.toml", manifest("also"))
  const store = createFolderAbilityStore({ root })
  expect((await store.listHttpTools()).map(p => p.name)).toEqual(["also", "good"])
})

test("scanHttpTools lists every manifest with its domain and key need, or its error", async () => {
  put("abilities/open/tool.toml", manifest("open"))
  put("abilities/keyed/tool.toml", manifest("keyed", 'auth = { type = "apiKey", in = "header", name = "X-Key" }'))
  put("abilities/broken/tool.toml", "not = [valid")
  put("abilities/.hidden/tool.toml", manifest("hidden"))
  const entries = await scanHttpTools(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "keyed", "open"])
  expect(entries[0]!.error).toBeDefined()
  expect(entries[1]).toMatchObject({ domain: "api.keyed.test", auth: { in: "header", name: "X-Key" } })
  expect(entries[2]).toMatchObject({ domain: "api.open.test", auth: undefined })
})

test("parseHttpToolManifest reads a manifest's text and says why a bad one is rejected", () => {
  expect(parseHttpToolManifest(manifest("text"), "text").baseUrl).toBe("https://api.text.test")
  expect(parseHttpToolManifest(manifest("text"), "folder").name).toBe("folder")
  expect(() => parseHttpToolManifest(`name = "text"\n${manifest("text")}`, "text")).toThrow("has a `name`")
  expect(() => parseHttpToolManifest("not = [valid", "x")).toThrow("invalid TOML")
  expect(() => parseHttpToolManifest('description = "x"', "x")).toThrow("invalid manifest")
})

test("listMcpAbilities reads every manifest; scanMcpAbilities shows the host or the command", async () => {
  put("abilities/docs/mcp.toml", 'description = "Docs"\nurl = "https://mcp.docs.test/mcp"\n')
  put(
    "abilities/browser/mcp.toml",
    'description = "Browser"\ntransport = "stdio"\ncommand = "bunx"\nargs = ["browser-mcp", "--headless"]\nauth = { type = "apiKey", in = "env", name = "B_KEY", optional = true }\n'
  )
  put("abilities/broken/mcp.toml", 'description = "x"\ntransport = "stdio"\n')
  const store = createFolderAbilityStore({ root })
  expect((await store.listMcpAbilities()).map(p => p.name)).toEqual(["browser", "docs"])

  const entries = await scanMcpAbilities(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "browser", "docs"])
  expect(entries[0]!.error).toContain("command")
  expect(entries[1]).toMatchObject({
    transport: "stdio",
    command: "bunx browser-mcp --headless",
    auth: { in: "env", name: "B_KEY", optional: true }
  })
  expect(entries[2]).toMatchObject({ transport: "http", domain: "mcp.docs.test", auth: undefined })
})

test("scans list each ability's tools with what they do", async () => {
  put(
    "abilities/two/tool.toml",
    `${manifest("two")}\n[[tools]]\nname = "two_put"\ndescription = "Put something"\nmethod = "PUT"\npath = "/things"\n`
  )
  put(
    "abilities/listed/mcp.toml",
    'description = "L"\nurl = "https://mcp.l.test/mcp"\ntools = ["read", "write"]\n[toolDescriptions]\nread = "Reads"\n'
  )
  expect((await scanMcpAbilities(root)).find(entry => entry.name === "listed")?.tools).toEqual([
    { name: "read", description: "Reads" },
    { name: "write", description: undefined }
  ])
  expect((await scanHttpTools(root)).find(entry => entry.name === "two")?.tools?.map(t => t.name)).toEqual([
    "two_get",
    "two_put"
  ])
})

test("readPersonas reads the named personas in order, id from the file name; broken, missing and badly named ones are skipped", async () => {
  put("personas/care.toml", 'label = "Care"\nwhen = "the user is sad"\ntemperature = 0.3\n')
  put("personas/barkochba.toml", 'label = "Barkochba"\n')
  put("personas/broken.toml", 'when = "no label"\n')
  put("personas/Bad_Name.toml", 'label = "Bad"\n')
  const personas = await readPersonas(root, ["care", "broken", "missing", "Bad_Name", "barkochba"])
  expect(personas).toEqual([
    { id: "care", label: "Care", when: "the user is sad", temperature: 0.3 },
    { id: "barkochba", label: "Barkochba" }
  ])
})

test("scanPersonas lists every persona file with its label, or why it can't load", async () => {
  put("personas/care.toml", 'label = "Care"\nwhen = "the user is sad"\n')
  put("personas/broken.toml", "label = \n")
  put("personas/care.bak.toml", 'label = "Old"\n')
  put("personas/care.bak.2.toml", 'label = "Older"\n')
  const entries = await scanPersonas(root)
  expect(entries.map(e => e.name)).toEqual(["broken", "care"])
  expect(entries[0]!.error).toContain("invalid TOML")
  expect(entries[1]).toEqual({ name: "care", label: "Care", when: "the user is sad" })
  expect(await scanPersonas(join(root, "nope"))).toEqual([])
})

test("parsePersonaManifest takes the id from its argument and rejects a file without a label", () => {
  expect(parsePersonaManifest('label = "Care"\n', "care")).toEqual({ id: "care", label: "Care" })
  expect(() => parsePersonaManifest('when = "x"\n', "care")).toThrow("invalid manifest (label")
})

test("readDatasets loads every valid datasets/*.json by topic; broken, badly named and backup files are left out", async () => {
  const onboarding = {
    label: "Onboarding",
    profile: true,
    fields: [{ name: "name", prompt: "What should I call you?" }]
  }
  put("datasets/onboarding.json", JSON.stringify(onboarding))
  put("datasets/broken.json", '{ "label": "No fields" }')
  put("datasets/Bad_Name.json", JSON.stringify(onboarding))
  put("datasets/onboarding.bak.json", "{}")
  const datasets = await readDatasets(root)
  expect([...datasets.keys()]).toEqual(["onboarding"])
  expect(datasets.get("onboarding")).toEqual(onboarding)

  const entries = await scanDatasets(root)
  expect(entries.map(e => e.name)).toEqual(["Bad_Name", "broken", "onboarding"])
  expect(entries[1]!.error).toContain("invalid dataset (fields")
  expect(entries[2]).toEqual({ name: "onboarding", label: "Onboarding" })
  expect(await readDatasets(join(root, "nope"))).toEqual(new Map())
})

test("parseDatasetManifest says why a dataset's text is invalid", () => {
  expect(() => parseDatasetManifest("{ nope")).toThrow("invalid JSON")
  expect(() => parseDatasetManifest('{ "label": "x", "fields": [] }')).toThrow("invalid dataset (fields")
})

test("readSkillBundle reads SKILL.md and the text files, and flags scripts", async () => {
  putSkill("pdf", "PDFs.", "Body.")
  put("abilities/pdf/reference.md", "ref")
  put("abilities/pdf/logo.png", new Uint8Array([0x89, 0x00, 0x01]))
  put("abilities/pdf/SKILL.bak.md", "old")
  const bundle = await readSkillBundle(root, "pdf")
  expect(bundle).toEqual({
    name: "pdf",
    description: "PDFs.",
    files: { "SKILL.md": "---\ndescription: PDFs.\n---\nBody.\n", "reference.md": "ref" },
    hasScripts: false
  })

  putSkill("tool")
  put("abilities/tool/scripts/run.sh", "echo hi")
  expect((await readSkillBundle(root, "tool")).hasScripts).toBe(true)
  await expect(readSkillBundle(root, "missing")).rejects.toThrow("no SKILL.md")
})

test("one folder can hold every part: each list sees its own, and the skill doesn't see the others' files", async () => {
  putSkill("mixed", "Mixed.", "How to use it.")
  put("abilities/mixed/notes.md", "notes")
  put("abilities/mixed/tool.toml", manifest("mixed"))
  put("abilities/mixed/mcp.toml", 'description = "M"\nurl = "https://mcp.m.test/mcp"\n')
  put(
    "abilities/mixed/tool.ts",
    'export const pingTool = { definition: { type: "function", function: { name: "mixed_ping" } }, execute: async () => "pong" }\nexport const notATool = { definition: {} }\n'
  )
  put("abilities/http-only/tool.toml", manifest("http-only"))
  const store = createFolderAbilityStore({ root })

  expect((await store.listSkills()).map(skill => [skill.name, skill.files])).toEqual([["mixed", ["notes.md"]]])
  expect((await store.listHttpTools()).map(tool => tool.name)).toEqual(["http-only", "mixed"])
  expect((await store.listMcpAbilities()).map(ability => ability.name)).toEqual(["mixed"])
  expect(await store.readSkill("mixed", "tool.toml")).toBeUndefined()
  expect(await store.readSkill("mixed", "TOOL.TS")).toBeUndefined()
  expect(await store.readSkill("mixed", "notes.md")).toBe("notes")

  const code = await store.listCodeTools!()
  expect(code.map(entry => [entry.name, entry.tools.length])).toEqual([["mixed", 1]])
  expect(await code[0]!.tools[0]!.execute({})).toBe("pong")
  expect(await scanCodeTools(root)).toEqual(["mixed"])

  // Only folders with a SKILL.md are skills; http-only isn't one
  expect((await scanSkills(root)).map(entry => entry.name)).toEqual(["mixed"])
  expect((await readSkillBundle(root, "mixed")).files).toEqual({
    "SKILL.md": "---\ndescription: Mixed.\n---\nHow to use it.\n",
    "notes.md": "notes"
  })
})

test("a SKILL.md's sticky suggestion reaches the skill's summary", async () => {
  put("abilities/rules/SKILL.md", "---\ndescription: Rules.\nsticky: true\n---\nAlways.\n")
  const store = createFolderAbilityStore({ root })
  expect((await store.listSkills())[0]?.sticky).toBe(true)
})
