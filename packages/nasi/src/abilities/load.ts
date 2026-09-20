import { warn } from "@kaja/logger"
import type { HttpToolAbility, McpAbility } from "@kaja/schema/abilities"
import type { Persona } from "@kaja/schema/cli"
import type { ToolGroup } from "../tools/registry"
import { createHttpTools } from "./http-tool"
import { type McpAbilityTarget, mcpAbilityTarget } from "./mcp-ability"
import { createLoadSkillTool } from "./skills"
import type { AbilityStore, SkillSummary } from "./types"

/** What a host's enabled abilities add to an agent. Each ability type adds its own field. */
export type LoadedAbilities = {
  /** Tool groups for `createTools`' `extraTools`, so ability tools go through the same name rules as every other tool. */
  groups: ToolGroup[]
  skills: SkillSummary[]
  /** Enabled HTTP tool abilities that loaded (their tools are in `groups`). */
  httpTools: HttpToolAbility[]
  /** Enabled MCP abilities ready to connect — hand them to `createTools`' `mcpAbilities`, which connects them with the other servers. */
  mcp: McpAbilityTarget[]
  /** Enabled abilities left out because their (required) key is missing. */
  missingKeys: string[]
}

export type LoadAbilitiesOptions = {
  personas?: Persona[]
  /** The ability's key from wherever the host keeps secrets (secrets.toml's [abilities.<name>] in the CLI). */
  getApiKey?: (abilityName: string) => string | undefined
  /** Let HTTP tools reach private/loopback hosts. Local mode only. */
  allowPrivate?: boolean
  /** HTTP(S) proxy HTTP tools egress through (the cloud's WEB_PROXY); unset goes direct. */
  proxy?: string
}

/**
 * Turns a store's enabled abilities into agent tool groups, one handler per ability type
 * (skills, HTTP tools, MCP servers). A store that fails outright loads nothing, with a warning, so a broken
 * ability folder never stops the agent from starting.
 */
export async function loadAbilities(store: AbilityStore, opts: LoadAbilitiesOptions = {}): Promise<LoadedAbilities> {
  const skills = await listOrWarn(() => store.listSkills(), "skills")
  const abilities = await listOrWarn(() => store.listHttpTools(), "HTTP tools")
  const mcpAbilities = await listOrWarn(() => store.listMcpAbilities(), "MCP abilities")

  // load_skill is Kaja's own mechanism, so it's official (and its name reserved) even though abilities switch it on.
  const groups: ToolGroup[] =
    skills.length > 0
      ? [{ origin: "official", tools: [createLoadSkillTool({ store, skills, personas: opts.personas })] }]
      : []

  const missingKeys: string[] = []
  /** The ability's key, or null when a required one is missing (the ability is then left out). */
  const keyFor = (ability: HttpToolAbility | McpAbility): string | undefined | null => {
    if (ability.auth.type !== "apiKey") return undefined
    const apiKey = opts.getApiKey?.(ability.name)
    if (apiKey || ability.auth.optional) return apiKey
    warn("Ability left out: no API key", { ability: ability.name, secret: `[abilities.${ability.name}] apiKey` })
    missingKeys.push(ability.name)
    return null
  }

  const httpTools: HttpToolAbility[] = []
  for (const ability of abilities) {
    const apiKey = keyFor(ability)
    if (apiKey === null) continue
    httpTools.push(ability)
    groups.push({
      origin: "community",
      source: `ability:${ability.name}`,
      tools: createHttpTools(ability, { apiKey, allowPrivate: opts.allowPrivate, proxy: opts.proxy })
    })
  }

  const mcp: McpAbilityTarget[] = []
  for (const ability of mcpAbilities) {
    const apiKey = keyFor(ability)
    if (apiKey !== null) mcp.push(mcpAbilityTarget(ability, apiKey))
  }

  return { groups, skills, httpTools, mcp, missingKeys }
}

// A list the store can't read counts as empty, with a warning, so one broken ability type doesn't stop the others.
async function listOrWarn<T>(list: () => Promise<T[]>, what: string): Promise<T[]> {
  try {
    return await list()
  } catch (error) {
    warn(`Failed to list ${what}`, { error: error instanceof Error ? error.message : error })
    return []
  }
}
