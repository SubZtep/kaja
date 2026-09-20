import { expect, test } from "bun:test"
import type { Dataset, Persona } from "@kaja/schema/cli"
import { createLoadSkillTool } from "../../src/abilities/skills"
import type { AbilityStore, SkillSummary } from "../../src/abilities/types"
import { Agent, runCommandTool, switchPersonaTool } from "../../src/agent/agent"
import { buildSystemPrompt, refreshAbilitiesInPrompt, replyLanguageInstructionFor } from "../../src/agent/system-prompt"
import { createMemoryStore } from "../../src/store"
import { datasetInfoTool } from "../../src/tools/builtin/dataset-info"

test("returns undefined for English — the model's default, no instruction needed", () => {
  expect(replyLanguageInstructionFor("en-GB")).toBeUndefined()
})

test("returns a reply-language instruction naming the language for a known non-English code", () => {
  expect(replyLanguageInstructionFor("hu-HU")).toContain("Hungarian")
})

test("returns a reply-language instruction for zh-TW", () => {
  expect(replyLanguageInstructionFor("zh-TW")).toContain("Traditional Chinese")
})

test("returns a reply-language instruction for nan-TW", () => {
  expect(replyLanguageInstructionFor("nan-TW")).toContain("Taiwanese Hokkien")
})

test("returns undefined for an unknown language code", () => {
  expect(replyLanguageInstructionFor("xx")).toBeUndefined()
})

const pdfSkill: SkillSummary = { name: "pdf", description: "Work with PDF files.", files: [] }
const notesSkill: SkillSummary = { name: "notes", description: "Keep notes.", files: [] }
const noStore: AbilityStore = {
  listSkills: async () => [],
  readSkill: async () => undefined,
  listHttpTools: async () => [],
  listMcpAbilities: async () => []
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
  await refreshAbilitiesInPrompt(skillAgent({ skills: [pdfSkill, notesSkill] }), messages, null)
  expect(messages[0]!.content).toContain("- notes: Keep notes.")
  expect(messages[0]!.content).toContain("- pdf: Work with PDF files.")
})

test("a skill turned off leaves the list, and the section goes when none are left", async () => {
  const messages = await conversationWith(skillAgent({ skills: [pdfSkill, notesSkill] }))
  await refreshAbilitiesInPrompt(skillAgent({ skills: [pdfSkill] }), messages, null)
  expect(messages[0]!.content).toContain("- pdf: Work with PDF files.")
  expect(messages[0]!.content).not.toContain("- notes:")

  const noSkills = new Agent({ model: "m", tools: [], personas: [], promptContext: { environment: "test" } })
  await refreshAbilitiesInPrompt(noSkills, messages, null)
  expect(messages[0]!.content).not.toContain("## Skills")
})

test("an unchanged skill list leaves the system prompt exactly as it was", async () => {
  const agent = skillAgent({ skills: [pdfSkill] })
  const messages = await conversationWith(agent)
  // Something else in the prompt that a rebuild would change: it must survive untouched.
  messages[0]!.content += "\n\nmarker from an earlier turn"
  const before = messages[0]!.content
  await refreshAbilitiesInPrompt(agent, messages, null)
  expect(messages[0]!.content).toBe(before)
})

test("a multi-line skill description is listed on one line", async () => {
  const wordy = { name: "wordy", description: "Line one.\n\nLine two.", files: [] }
  const prompt = (await buildSystemPrompt(skillAgent({ skills: [wordy] }))) ?? ""
  expect(prompt).toContain("- wordy: Line one. Line two.")
})

const helper: Persona = { id: "default", label: "Helpful assistant" }
const care: Persona = { id: "care", label: "Care", when: "the user is sad" }
const quiz: Persona = { id: "quiz", label: "Quiz", when: "the user wants a game" }

function personaAgent(personas: Persona[], personaId = "default") {
  return new Agent({
    model: "m",
    tools: [switchPersonaTool],
    personas,
    personaId,
    promptContext: { environment: "test" }
  })
}

test("a running conversation's persona roster follows personas turned on or off since it started", async () => {
  const messages = await conversationWith(personaAgent([helper, care]))
  await refreshAbilitiesInPrompt(personaAgent([helper, care, quiz]), messages, null)
  expect(messages[0]!.content).toContain("- quiz (Quiz): use when the user wants a game")

  await refreshAbilitiesInPrompt(personaAgent([helper]), messages, null)
  expect(messages[0]!.content).not.toContain("## Personas")
})

test("an unchanged persona roster leaves the system prompt exactly as it was", async () => {
  const agent = personaAgent([helper, care], "care")
  const messages = await conversationWith(agent)
  messages[0]!.content += "\n\nmarker from an earlier turn"
  const before = messages[0]!.content
  await refreshAbilitiesInPrompt(agent, messages, null)
  expect(messages[0]!.content).toBe(before)
})

const profile: Dataset = {
  label: "Onboarding",
  profile: true,
  fields: [
    { name: "name", prompt: "What should I call you?" },
    { name: "pronouns", prompt: "Which pronouns?" },
    { name: "home", prompt: "Where do you live?" },
    { name: "pets", prompt: "Any pets?" }
  ]
}

/** An agent with dataset_info and a store holding `answers` for `owner` in the onboarding profile. */
async function profileAgent(answers: Record<string, string>, opts: { dataset?: string; owner?: string | null } = {}) {
  const store = createMemoryStore()
  for (const [field, value] of Object.entries(answers))
    await store.saveDatasetAnswer("onboarding", opts.owner ?? null, 1, field, value)
  return new Agent({
    model: "m",
    tools: [datasetInfoTool],
    store,
    dataset: opts.dataset,
    promptContext: { environment: "test", loadDatasets: async () => new Map([["onboarding", profile]]) }
  })
}

test("## About the user lists what the user shared, hides what they declined, and names what's still missing", async () => {
  const prompt =
    (await buildSystemPrompt(
      await profileAgent({ name: "Andras", pronouns: "Prefer not to say", home: "Budapest" }),
      null
    )) ?? ""
  expect(prompt).toContain("## About the user")
  expect(prompt).toContain("- name: Andras\n- home: Budapest")
  expect(prompt).not.toContain("pronouns:")
  // Declined counts as answered: only pets is left to pick up, and the name isn't asked for again.
  expect(prompt).toContain("still missing (pets)")
  expect(prompt).not.toContain("kindly ask")
})

test("## About the user asks for the name once while it's unknown", async () => {
  const prompt = (await buildSystemPrompt(await profileAgent({}), null)) ?? ""
  expect(prompt).toContain("hasn't shared anything")
  expect(prompt).toContain('kindly ask once ("What should I call you?")')
})

test("the persona collecting the profile gets what's known, without the pick-it-up-as-you-go rules", async () => {
  const prompt =
    (await buildSystemPrompt(await profileAgent({ name: "Andras" }, { dataset: "onboarding" }), null)) ?? ""
  expect(prompt).toContain("- name: Andras")
  expect(prompt).not.toContain("still missing")
})

test("## About the user only shows the answers of the owner the prompt is for", async () => {
  const agent = await profileAgent({ name: "Andras" }, { owner: "telegram:1" })
  expect((await buildSystemPrompt(agent, "telegram:1")) ?? "").toContain("- name: Andras")
  expect((await buildSystemPrompt(agent, "telegram:2")) ?? "").not.toContain("Andras")
})

test("a dataset that isn't a profile adds no About the user section", async () => {
  const agent = await profileAgent({ name: "Andras" })
  agent.promptContext.loadDatasets = async () => new Map([["onboarding", { ...profile, profile: false }]])
  expect((await buildSystemPrompt(agent, null)) ?? "").not.toContain("## About the user")
})
