import type { HttpToolAbility, McpAbility } from "@kaja/schema/abilities"
import type { Persona } from "@kaja/schema/cli"
import { type Tool, toolName } from "../agent/tools"
import { type LaunchOptions, McpRunnerMissingError } from "../mcp/launch"
import { expandRoots, type RootFolder } from "../mcp/roots"
import type { ToolGroup } from "../tools/registry"
import { warn } from "../warn"
import { createHttpTools } from "./http-tool"
import { type McpAbilityTarget, type McpSandbox, mcpAbilityTarget, sandboxedMcpTarget } from "./mcp-ability"
import { personaAbilities } from "./persona-scope"
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
  /** Enabled abilities a persona uses (any, without personas) left out because their (required) key is missing. */
  missingKeys: string[]
  /** Stdio MCP abilities a persona uses (any, without personas) left out because nothing here can start them, with the programs that would. */
  missingRunners: { name: string; needs: string[] }[]
  /** MCP abilities that take roots, left out because no persona that lists them gives them a folder. */
  missingRoots: string[]
}

export type LoadAbilitiesOptions = {
  personas?: Persona[]
  /** The ability's key from wherever the host keeps secrets (secrets.toml's [abilities.<name>] in the CLI). */
  getApiKey?: (abilityName: string) => string | undefined
  /** Let HTTP tools reach private/loopback hosts. Local mode only. */
  allowPrivate?: boolean
  /** HTTP(S) proxy HTTP tools egress through (the cloud's WEB_PROXY); unset goes direct. */
  proxy?: string
  /** Where stdio MCP abilities run when the host can't start commands itself (the cloud); unset connects them as they are. */
  mcpSandbox?: McpSandbox
  /** How stdio MCP abilities find a runner on this host (tests fake `which`). */
  launch?: LaunchOptions
  /** Warn about persona entries naming an ability, or a tool of one, that isn't there: on for a host whose store is every ability the user has (the CLI), off where parts are left out on purpose (the cloud). */
  warnUnknown?: boolean
}

/**
 * Turns a store's enabled abilities into agent tool groups, one handler per ability type
 * (skills, code tools, HTTP tools, MCP servers). A store that fails outright loads nothing, with a warning, so a broken
 * ability folder never stops the agent from starting.
 */
export async function loadAbilities(store: AbilityStore, opts: LoadAbilitiesOptions = {}): Promise<LoadedAbilities> {
  const skills = await listOrWarn(() => store.listSkills(), "skills")
  const abilities = await listOrWarn(() => store.listHttpTools(), "HTTP tools")
  const mcpAbilities = await listOrWarn(() => store.listMcpAbilities(), "MCP abilities")
  // A missing key only matters for an ability some persona uses; without personas, every one counts.
  const listed = opts.personas && new Set(opts.personas.flatMap(persona => [...personaAbilities(persona).keys()]))
  // Importing a tool.ts runs it, so only the ones a persona lists load (every one without personas).
  const codeTools = store.listCodeTools ? await listOrWarn(() => store.listCodeTools!(listed), "code tools") : []
  if (opts.warnUnknown && opts.personas)
    warnUnknownEntries(opts.personas, knownTools(skills, abilities, mcpAbilities, codeTools))

  // load_skill is Kaja's own mechanism, so it's official (and its name reserved) even though abilities switch it on.
  const groups: ToolGroup[] =
    skills.length > 0
      ? [{ origin: "official", tools: [createLoadSkillTool({ store, skills, personas: opts.personas })] }]
      : []

  const missingKeys: string[] = []
  for (const code of codeTools) groups.push({ origin: "community", source: `ability:${code.name}`, tools: code.tools })

  const httpTools: HttpToolAbility[] = []
  for (const ability of abilities) {
    const apiKey = abilityKey(ability, opts, listed, missingKeys)
    if (apiKey === null) continue
    httpTools.push(ability)
    groups.push({
      origin: "community",
      source: `ability:${ability.name}`,
      tools: createHttpTools(ability, { apiKey, allowPrivate: opts.allowPrivate, proxy: opts.proxy })
    })
  }

  // Each runs up to its roots synchronously, in order, so their key warnings and `missingKeys` keep the list's order.
  const loaded = await Promise.all(mcpAbilities.map(ability => loadMcpAbility(ability, opts, listed, missingKeys)))
  return {
    groups,
    skills,
    httpTools,
    mcp: loaded.flatMap(one => one.target ?? []),
    missingKeys,
    missingRunners: loaded.flatMap(one => one.missingRunner ?? []),
    missingRoots: loaded.flatMap(one => one.missingRoots ?? [])
  }
}

type LoadedMcpAbility = {
  target?: McpAbilityTarget
  missingRunner?: LoadedAbilities["missingRunners"][number]
  missingRoots?: string
}

/** The ability's key (none for a keyless one without it), or null when it's missing (the ability is then left out). */
function abilityKey(
  ability: HttpToolAbility | McpAbility,
  opts: LoadAbilitiesOptions,
  listed: Set<string> | undefined,
  missingKeys: string[]
): string | undefined | null {
  if (ability.auth.type !== "apiKey") return undefined
  const apiKey = opts.getApiKey?.(ability.name)
  if (apiKey || ability.auth.keyless) return apiKey
  if (!listed || listed.has(ability.name)) {
    warn("Ability left out: no API key", { ability: ability.name, secret: `[abilities.${ability.name}] api_key` })
    missingKeys.push(ability.name)
  }
  return null
}

// One MCP ability as a target, or why it's left out: a missing key (in `missingKeys`), runner or roots.
async function loadMcpAbility(
  ability: McpAbility,
  opts: LoadAbilitiesOptions,
  listed: Set<string> | undefined,
  missingKeys: string[]
): Promise<LoadedMcpAbility> {
  const apiKey = abilityKey(ability, opts, listed, missingKeys)
  if (apiKey === null) return {}
  if (ability.transport === "stdio" && opts.mcpSandbox) return { target: sandboxedMcpTarget(ability) }
  if (!ability.roots && opts.warnUnknown) warnRootsIgnored(opts.personas ?? [], ability.name)
  const roots = ability.roots ? await personaRoots(opts.personas ?? [], ability) : undefined
  if (roots && Object.keys(roots).length === 0) {
    if (!opts.personas?.some(persona => personaAbilities(persona).has(ability.name))) return {}
    warn("Ability left out: no persona that lists it gives it roots", { ability: ability.name })
    return { missingRoots: ability.name }
  }
  try {
    return { target: mcpAbilityTarget(ability, apiKey, opts.launch, roots) }
  } catch (error) {
    if (!(error instanceof McpRunnerMissingError)) throw error
    if (listed && !listed.has(ability.name)) return {}
    warn("Ability left out: nothing installed can start it", { ability: ability.name, needs: error.needs })
    return { missingRunner: { name: ability.name, needs: error.needs } }
  }
}

// Each ability's tool names, where they're known before connecting (an MCP server without a `tools` list isn't).
function knownTools(
  skills: SkillSummary[],
  abilities: HttpToolAbility[],
  mcpAbilities: McpAbility[],
  codeTools: { name: string; tools: Tool[] }[]
): Map<string, Set<string> | undefined> {
  const known = new Map<string, Set<string> | undefined>()
  const addTools = (name: string, tools: string[] | undefined) => {
    // Once a part's tools are unknown, the whole ability's are.
    if (known.has(name) && known.get(name) === undefined) return
    known.set(name, tools && new Set([...(known.get(name) ?? []), ...tools]))
  }
  for (const skill of skills) if (!known.has(skill.name)) known.set(skill.name, new Set())
  for (const ability of abilities)
    addTools(
      ability.name,
      ability.tools.map(tool => tool.name)
    )
  for (const ability of mcpAbilities) addTools(ability.name, ability.tools)
  for (const code of codeTools) addTools(code.name, code.tools.map(toolName))
  return known
}

/**
 * Each persona's folders for the ability (its entry's `roots`, expanded), leaving out personas that give none. A
 * read-only folder needs the manifest's `pathArgs` to check writes against, so without them it's left out.
 */
async function personaRoots(personas: Persona[], ability: McpAbility): Promise<Record<string, RootFolder[]>> {
  const entries = await Promise.all(
    personas.map(async persona => [persona.id, await personaFolders(persona, ability)] as const)
  )
  return Object.fromEntries(entries.filter(([, folders]) => folders.length > 0))
}

// One persona's folders for the ability, read-only ones left out when the manifest names no pathArgs.
async function personaFolders(persona: Persona, ability: McpAbility): Promise<RootFolder[]> {
  const where = { persona: persona.id, ability: ability.name }
  const expanded = await expandRoots(personaAbilities(persona).get(ability.name)?.roots ?? [], where)
  return expanded.filter(root => {
    if (!root.readOnly || ability.pathArgs?.length) return true
    warn("Read-only root left out: the ability's manifest names no pathArgs to check writes by", {
      ...where,
      root: root.folder
    })
    return false
  })
}

/** Warns about a persona giving roots to an ability whose server doesn't take them. */
function warnRootsIgnored(personas: Persona[], ability: string): void {
  for (const persona of personas)
    if (personaAbilities(persona).get(ability)?.roots)
      warn("Persona gives roots to an ability that doesn't take them", { persona: persona.id, ability })
}

/** Warns once per persona entry that names an ability the store doesn't have, or a tool its ability doesn't offer. */
function warnUnknownEntries(personas: Persona[], known: Map<string, Set<string> | undefined>): void {
  for (const persona of personas) {
    for (const entry of personaAbilities(persona).values()) {
      if (!known.has(entry.name)) {
        warn("Persona lists an ability that isn't there", { persona: persona.id, ability: entry.name })
        continue
      }
      const tools = known.get(entry.name)
      const missing = tools ? (entry.tools ?? []).filter(tool => !tools.has(tool)) : []
      if (missing.length > 0)
        warn("Persona lists tools its ability doesn't offer", {
          persona: persona.id,
          ability: entry.name,
          tools: missing
        })
    }
  }
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
