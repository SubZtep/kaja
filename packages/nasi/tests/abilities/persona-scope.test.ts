import { expect, test } from "bun:test"
import type { Persona } from "@kaja/schema/cli"
import { abilityOfTool, personaAbilities, skillMode, toolsForPersona } from "../../src/abilities/persona-scope"
import type { SkillSummary } from "../../src/abilities/types"
import { type Tool, toolName } from "../../src/agent/tools"

const fn = (name: string, source?: string): Tool => ({
  definition: { type: "function", function: { name, parameters: { type: "object", properties: {} } } },
  execute: async () => "ok",
  ...(source ? { source } : {})
})

const tools = [
  fn("ask_user"),
  fn("load_skill"),
  fn("web_search", "ability:web-search"),
  fn("navigate_page", "ability:chrome-devtools"),
  fn("take_screenshot", "ability:chrome-devtools"),
  fn("roll_dice", "ability:dice"),
  fn("read_thing", "mcp:own")
]
const pdf: SkillSummary = { name: "pdf", description: "PDFs.", files: [] }
const rules: SkillSummary = { name: "rules", description: "Rules.", files: [], sticky: true }

const names = (persona: Persona, skills: SkillSummary[] = []) => toolsForPersona(tools, persona, skills).map(toolName)

test("a persona gets builtins and mcp.toml servers, plus only the abilities it lists", () => {
  expect(names({ id: "none", label: "None" })).toEqual(["ask_user", "read_thing"])
  expect(names({ id: "web", label: "Web", abilities: ["web-search", "dice"] })).toEqual([
    "ask_user",
    "web_search",
    "roll_dice",
    "read_thing"
  ])
})

test("an entry's tools list narrows that ability to those tools", () => {
  const persona: Persona = { id: "b", label: "B", abilities: [{ name: "chrome-devtools", tools: ["navigate_page"] }] }
  expect(names(persona)).toEqual(["ask_user", "navigate_page", "read_thing"])
})

test("load_skill comes along only when the persona has a skill to load", () => {
  expect(names({ id: "p", label: "P", abilities: ["pdf"] }, [pdf])).toContain("load_skill")
  expect(names({ id: "o", label: "O", abilities: [{ name: "pdf", skill: "off" }] }, [pdf])).not.toContain("load_skill")
  // A sticky skill is already in the prompt, so it alone doesn't bring load_skill, unless it has files to open
  expect(names({ id: "s", label: "S", abilities: ["rules"] }, [rules])).not.toContain("load_skill")
  const withTemplate = { ...rules, files: ["template.md"] }
  expect(names({ id: "s", label: "S", abilities: ["rules"] }, [withTemplate])).toContain("load_skill")
  expect(names({ id: "x", label: "X", abilities: ["web-search"] }, [pdf])).not.toContain("load_skill")
})

test("skillMode: the entry decides, else SKILL.md's sticky suggestion, else load; unlisted is off", () => {
  expect(skillMode(pdf, { abilities: ["pdf"] })).toBe("load")
  expect(skillMode(rules, { abilities: ["rules"] })).toBe("sticky")
  expect(skillMode(rules, { abilities: [{ name: "rules", skill: "load" }] })).toBe("load")
  expect(skillMode(pdf, { abilities: [{ name: "pdf", skill: "sticky" }] })).toBe("sticky")
  expect(skillMode(pdf, { abilities: ["rules"] })).toBe("off")
  expect(skillMode(pdf, {})).toBe("off")
})

test("personaAbilities expands the shorthand; abilityOfTool reads the source", () => {
  expect([...personaAbilities({ abilities: ["a", { name: "b", skill: "off" }] }).values()]).toEqual([
    { name: "a" },
    { name: "b", skill: "off" }
  ])
  expect(abilityOfTool(fn("x", "ability:dice"))).toBe("dice")
  expect(abilityOfTool(fn("x", "mcp:own"))).toBeUndefined()
  expect(abilityOfTool(fn("x"))).toBeUndefined()
})
