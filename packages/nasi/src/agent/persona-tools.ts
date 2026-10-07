import { personaAbilities, toolsForPersona } from "../abilities/persona-scope"
import { LOAD_SKILL_TOOL, type LoadSkillTool } from "../abilities/skills"
import type { Agent } from "./agent"
import { type Tool, toolName } from "./tools"

/** The persona the agent is using now, if it has one from its roster. */
export function activePersona(agent: Agent) {
  return agent.personaId === undefined ? undefined : agent.personas.find(p => p.id === agent.personaId)
}

/** The load_skill tool among the agent's tools, with the skill catalog it serves. */
export function loadSkillToolOf(agent: Agent): LoadSkillTool | undefined {
  return agent.tools.find(t => toolName(t) === LOAD_SKILL_TOOL) as LoadSkillTool | undefined
}

/** What the model may call now: the active persona's tools (see {@link toolsForPersona}), or every tool for an agent without a persona. */
export function personaTools(agent: Agent): Tool[] {
  const persona = activePersona(agent)
  if (!persona) return agent.tools
  return toolsForPersona(agent.tools, persona, loadSkillToolOf(agent)?.skills ?? [])
}

/** Has the host connect what the active persona's abilities need (its MCP servers; every one for an agent without a persona) and takes the tool list that results; a no-op without {@link Agent.ensureTools}. */
export async function syncPersonaTools(agent: Agent): Promise<void> {
  if (!agent.ensureTools) return
  const persona = activePersona(agent)
  agent.tools = await agent.ensureTools(persona ? [...personaAbilities(persona).keys()] : undefined)
}
