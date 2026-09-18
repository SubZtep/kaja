import { warn } from "@kaja/logger"
import type { Persona } from "@kaja/schema/cli"
import type { Tool } from "../agent/tools"
import { createLoadSkillTool } from "./skills"
import type { PackageStore, SkillSummary } from "./types"

/** What a host's enabled packages add to an agent. Each package type adds its own field. */
export type LoadedPackages = {
  tools: Tool<any>[]
  skills: SkillSummary[]
}

/**
 * Turns a store's enabled packages into agent tools, one handler per package type
 * (skills today). A store that fails outright loads nothing, with a warning, so a broken
 * package folder never stops the agent from starting.
 */
export async function loadPackages(store: PackageStore, opts: { personas?: Persona[] } = {}): Promise<LoadedPackages> {
  let skills: SkillSummary[] = []
  try {
    skills = await store.listSkills()
  } catch (error) {
    warn("Failed to list skills", { error: error instanceof Error ? error.message : error })
  }

  const tools = skills.length > 0 ? [createLoadSkillTool({ store, skills, personas: opts.personas })] : []
  return { tools, skills }
}
