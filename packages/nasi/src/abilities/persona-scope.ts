import type { Persona, PersonaAbility, SkillMode } from "@kaja/schema/cli"
import { type Tool, toolName } from "../agent/tools"
import type { SkillSummary } from "./types"

/** One `abilities` entry with the shorthand expanded. */
export type PersonaAbilityEntry = { name: string; skill?: SkillMode; tools?: string[]; roots?: string[] }

const ABILITY_SOURCE = "ability:"

function entryOf(entry: PersonaAbility): PersonaAbilityEntry {
  return typeof entry === "string" ? { name: entry } : entry
}

/** A persona's ability entries by name; a name listed twice keeps its last entry. Empty when the persona lists none. */
export function personaAbilities(persona: Pick<Persona, "abilities">): Map<string, PersonaAbilityEntry> {
  return new Map((persona.abilities ?? []).map(entry => [entryOf(entry).name, entryOf(entry)]))
}

/** How `persona` uses `skill`: its entry's `skill`, else the SKILL.md's sticky suggestion, else `load`; `off` when the persona doesn't list it. */
export function skillMode(skill: SkillSummary, persona: Pick<Persona, "abilities">): SkillMode {
  const entry = personaAbilities(persona).get(skill.name)
  if (!entry) return "off"
  return entry.skill ?? (skill.sticky ? "sticky" : "load")
}

/** The ability a tool belongs to (its `ability:<name>` source), or undefined for one that isn't an ability's. */
export function abilityOfTool(tool: Tool): string | undefined {
  return tool.source?.startsWith(ABILITY_SOURCE) ? tool.source.slice(ABILITY_SOURCE.length) : undefined
}

/**
 * The tools `persona` gets: every tool that isn't an ability's (builtins, mcp.toml servers), plus the tools of the
 * abilities it lists, narrowed to an entry's `tools` when it sets them. `load_skill` comes along only when the persona
 * has a skill to load (see {@link skillMode}); `skills` says which skills that tool serves.
 */
export function toolsForPersona(tools: Tool[], persona: Pick<Persona, "abilities">, skills: SkillSummary[]): Tool[] {
  const entries = personaAbilities(persona)
  const loadable = skills.some(skill => skillMode(skill, persona) === "load")
  return tools.filter(tool => {
    const ability = abilityOfTool(tool)
    if (ability === undefined) return toolName(tool) !== LOAD_SKILL_NAME || loadable
    const entry = entries.get(ability)
    return entry !== undefined && (!entry.tools || entry.tools.includes(toolName(tool)))
  })
}

// Kept here rather than imported from ./skills, which imports this module.
const LOAD_SKILL_NAME = "load_skill"
