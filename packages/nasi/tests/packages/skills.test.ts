import { expect, test } from "bun:test"
import type { Persona } from "@kaja/schema/cli"
import { loadPackages } from "../../src/packages/load"
import { createLoadSkillTool, skillsForPersona } from "../../src/packages/skills"
import { type PackageStore, SkillFileError, type SkillSummary } from "../../src/packages/types"

const pdf: SkillSummary = { name: "pdf", description: "PDFs.", dir: "/skills/pdf", files: ["reference.md"] }
const notes: SkillSummary = { name: "notes", description: "Notes.", files: [] }

function fakeStore(skills: SkillSummary[], files: Record<string, string> = {}): PackageStore {
  return {
    listSkills: async () => skills,
    readSkill: async (name, file) => {
      if (file === "../escape") throw new SkillFileError("outside the skill folder")
      return files[file ? `${name}/${file}` : name]
    }
  }
}

const coder: Persona = { id: "coder", label: "Coder", skills: ["pdf"] }
const quiet: Persona = { id: "quiet", label: "Quiet", skills: [] }
const plain: Persona = { id: "plain", label: "Plain" }

test("skillsForPersona: unset means all, a list limits, an empty list means none", () => {
  expect(skillsForPersona([pdf, notes], plain)).toEqual([pdf, notes])
  expect(skillsForPersona([pdf, notes], coder)).toEqual([pdf])
  expect(skillsForPersona([pdf, notes], quiet)).toEqual([])
  expect(skillsForPersona([pdf, notes], undefined)).toEqual([pdf, notes])
})

test("load_skill returns the header with folder and files, then the body", async () => {
  const tool = createLoadSkillTool({ store: fakeStore([pdf], { pdf: "Step one." }), skills: [pdf] })
  const text = await tool.execute({ name: "pdf" })
  expect(text).toBe(
    "# Skill: pdf\nSkill directory: /skills/pdf\nOther files (load with file=<path>): reference.md\n\nStep one."
  )
})

test("load_skill reads another file as-is", async () => {
  const tool = createLoadSkillTool({ store: fakeStore([pdf], { "pdf/reference.md": "ref" }), skills: [pdf] })
  expect(await tool.execute({ name: "pdf", file: "reference.md" })).toBe("ref")
})

test("load_skill answers in text (not a thrown error) for unknown skills, missing files and denied paths", async () => {
  const tool = createLoadSkillTool({ store: fakeStore([pdf]), skills: [pdf] })
  expect(await tool.execute({ name: "docx" })).toContain("Available skills: pdf")
  expect(await tool.execute({ name: "pdf", file: "nope.md" })).toContain("Its files: reference.md")
  expect(await tool.execute({ name: "pdf", file: "../escape" })).toBe("Error: outside the skill folder")
})

test("load_skill refuses skills the active persona may not use", async () => {
  const tool = createLoadSkillTool({
    store: fakeStore([pdf, notes], { notes: "n" }),
    skills: [pdf, notes],
    personas: [coder, plain]
  })
  expect(await tool.execute({ name: "notes" }, { owner: null, personaId: "coder" })).toContain("No skill named")
  expect(await tool.execute({ name: "notes" }, { owner: null, personaId: "plain" })).toContain("n")
})

test("loadPackages adds no tool when no skill is enabled", async () => {
  expect(await loadPackages(fakeStore([]))).toEqual({ tools: [], skills: [] })
})

test("loadPackages survives a store that throws", async () => {
  const broken: PackageStore = {
    listSkills: async () => {
      throw new Error("EACCES")
    },
    readSkill: async () => undefined
  }
  expect(await loadPackages(broken)).toEqual({ tools: [], skills: [] })
})

test("loadPackages adds load_skill carrying the skill list", async () => {
  const { tools, skills } = await loadPackages(fakeStore([pdf]))
  expect(skills).toEqual([pdf])
  expect(tools).toHaveLength(1)
  expect(tools[0]!.definition.type === "function" && tools[0]!.definition.function.name).toBe("load_skill")
})
