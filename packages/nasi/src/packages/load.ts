import { warn } from "@kaja/logger"
import type { Persona } from "@kaja/schema/cli"
import type { ToolGroup } from "../tools/registry"
import { createLoadSkillTool } from "./skills"
import type { PackageStore, SkillSummary } from "./types"

/** What a host's enabled packages add to an agent. Each package type adds its own field. */
export type LoadedPackages = {
  /** Tool groups for `createTools`' `extraTools`, so package tools go through the same name rules as every other tool. */
  groups: ToolGroup[]
  skills: SkillSummary[]
}

/**
 * Turns a store's enabled packages into agent tool groups, one handler per package type
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

  // load_skill is Kaja's own mechanism, so it's official (and its name reserved) even though packages switch it on.
  const groups: ToolGroup[] =
    skills.length > 0
      ? [{ origin: "official", tools: [createLoadSkillTool({ store, skills, personas: opts.personas })] }]
      : []
  return { groups, skills }
}
