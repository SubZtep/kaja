import { expect, test } from "bun:test"
import type { Persona } from "@kaja/schema/cli"
import { Agent, runCommandTool } from "../../src/agent/agent"
import { buildSystemPrompt, refreshSkillsInPrompt, replyLanguageInstructionFor } from "../../src/agent/system-prompt"
import { createLoadSkillTool } from "../../src/packages/skills"
import type { PackageStore, SkillSummary } from "../../src/packages/types"

test("returns undefined for English — the model's default, no instruction needed", () => {
  expect(replyLanguageInstructionFor("en-GB")).toBeUndefined()
})

test("returns a reply-language instruction naming the language for a known non-English code", () => {
  expect(replyLanguageInstructionFor("hu-HU")).toContain("Hungarian")
})

test("returns a reply-language instruction for nan-TW", () => {
  expect(replyLanguageInstructionFor("nan-TW")).toContain("Taiwanese Hokkien")
})

test("returns undefined for an unknown language code", () => {
  expect(replyLanguageInstructionFor("xx")).toBeUndefined()
})

const pdfSkill: SkillSummary = { name: "pdf", description: "Work with PDF files.", files: [] }
const notesSkill: SkillSummary = { name: "notes", description: "Keep notes.", files: [] }
const noStore: PackageStore = {
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => [],
  listMcpPackages: async () => []
}

function skillAgent(opts: { persona?: Persona; withRunCommand?: boolean; skills?: SkillSummary[] }) {
  const personas = opts.persona ? [opts.persona] : []
  const loadSkill = createLoadSkillTool({ store: noStore, skills: opts.skills ?? [pdfSkill, notesSkill], personas })
  return new Agent({
    model: "m",
    tools: [loadSkill, ...(opts.withRunCommand ? [runCommandTool] : [])],
    personas,
    personaId: opts.persona?.id,
    promptContext: { environment: "test" }
  })
}

test("## Skills lists enabled skills when load_skill is present", async () => {
  const prompt = (await buildSystemPrompt(skillAgent({}))) ?? ""
  expect(prompt).toContain("## Skills")
  expect(prompt).toContain("- pdf: Work with PDF files.")
  expect(prompt).toContain("- notes: Keep notes.")
})

test("## Skills is absent without load_skill", async () => {
  const agent = new Agent({ model: "m", tools: [], promptContext: { environment: "test" } })
  expect((await buildSystemPrompt(agent)) ?? "").not.toContain("## Skills")
})

test("## Skills follows the active persona's skills list, and disappears when it's empty", async () => {
  const limited = (await buildSystemPrompt(skillAgent({ persona: { id: "c", label: "C", skills: ["pdf"] } }))) ?? ""
  expect(limited).toContain("- pdf:")
  expect(limited).not.toContain("- notes:")

  const none = (await buildSystemPrompt(skillAgent({ persona: { id: "q", label: "Q", skills: [] } }))) ?? ""
  expect(none).not.toContain("## Skills")
})

test("## Skills mentions running scripts only when run_command is available", async () => {
  expect((await buildSystemPrompt(skillAgent({}))) ?? "").not.toContain("run_command")
  expect((await buildSystemPrompt(skillAgent({ withRunCommand: true }))) ?? "").toContain(
    "Run a skill's bundled scripts with run_command"
  )
})

/** A running conversation's messages, with the system prompt `agent` would have built at its start. */
async function conversationWith(agent: Agent) {
  const system = (await buildSystemPrompt(agent)) ?? ""
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: "hi" }
  ]
}

test("a running conversation picks up a skill turned on since it started", async () => {
  const messages = await conversationWith(skillAgent({ skills: [pdfSkill] }))
  await refreshSkillsInPrompt(skillAgent({ skills: [pdfSkill, notesSkill] }), messages, null)
  expect(messages[0]!.content).toContain("- notes: Keep notes.")
  expect(messages[0]!.content).toContain("- pdf: Work with PDF files.")
})

test("a skill turned off leaves the list, and the section goes when none are left", async () => {
  const messages = await conversationWith(skillAgent({ skills: [pdfSkill, notesSkill] }))
  await refreshSkillsInPrompt(skillAgent({ skills: [pdfSkill] }), messages, null)
  expect(messages[0]!.content).toContain("- pdf: Work with PDF files.")
  expect(messages[0]!.content).not.toContain("- notes:")

  const noSkills = new Agent({ model: "m", tools: [], personas: [], promptContext: { environment: "test" } })
  await refreshSkillsInPrompt(noSkills, messages, null)
  expect(messages[0]!.content).not.toContain("## Skills")
})

test("an unchanged skill list leaves the system prompt exactly as it was", async () => {
  const agent = skillAgent({ skills: [pdfSkill] })
  const messages = await conversationWith(agent)
  // Something else in the prompt that a rebuild would change: it must survive untouched.
  messages[0]!.content += "\n\nmarker from an earlier turn"
  const before = messages[0]!.content
  await refreshSkillsInPrompt(agent, messages, null)
  expect(messages[0]!.content).toBe(before)
})

test("a multi-line skill description is listed on one line", async () => {
  const wordy = { name: "wordy", description: "Line one.\n\nLine two.", files: [] }
  const prompt = (await buildSystemPrompt(skillAgent({ skills: [wordy] }))) ?? ""
  expect(prompt).toContain("- wordy: Line one. Line two.")
})
