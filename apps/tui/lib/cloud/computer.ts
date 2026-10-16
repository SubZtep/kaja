import { readFile } from "node:fs/promises"
import type { AbilityStore, Tool } from "@kaja/nasi"
import type { Persona } from "@kaja/schema/cli"
import type { NasiClientCall, NasiClientSkill, NasiClientTool, NasiToolResult } from "@kaja/schema/nasi"
import { getMarketplaceDir, ownAbilities } from "../abilities/abilities-file"
import { toolHosts } from "../abilities/sandbox-relay"
import { secrets } from "../config/secrets"
import { log } from "../logger"
import { getBackupDir, getPaths } from "../paths"
import { loadPersonas } from "../personas/personas"

/** Builtins a cloud turn may run here: files always, the shell only when settings.toml's `[tools.hosts] shell = "computer"`. */
const FILE_BUILTINS = ["read_file", "list_files", "view_image"]
const SHELL = "run_command"
/** The `[tools.hosts]` key that lets the cloud's model use this computer's shell. */
export const SHELL_HOST_KEY = "shell"

/** What a run asks the user before it goes ahead: a shell command or a tool's request summary; resolves to their answer. */
export type Approve = (
  request: { kind: "command"; command: string } | { kind: "tool"; name: string; summary: string }
) => Promise<boolean>

/** This computer as a cloud turn's client: what it declares with every turn, and how it runs a paused call. */
export type Computer = {
  tools: NasiClientTool[]
  skills: NasiClientSkill[]
  personas: Persona[]
  /** Runs one call here, asking first where `--local` would; `personaId` (the turn's active persona) picks a roots-taking server's folders. */
  run: (call: NasiClientCall, approve: Approve, personaId?: string) => Promise<NasiToolResult>
  close: () => Promise<void>
}

/**
 * The abilities a cloud turn runs on this computer: your own (all their parts), local-only ones (`localOnly`, `roots`),
 * and stdio ones settings.toml's `[tools.hosts]` sets to `computer`. Everything else stays with the cloud (a sandbox).
 */
export async function computerAbilities(root = getMarketplaceDir()): Promise<Set<string>> {
  const { scanMcpAbilities } = await import("@kaja/nasi")
  const hosts = await toolHosts()
  const own = (await ownAbilities(root)).abilities
  const mcp = (await scanMcpAbilities(root)).filter(
    entry => entry.localOnly || (entry.transport === "stdio" && hosts[entry.name] === "computer")
  )
  return new Set([...own, ...mcp.map(entry => entry.name)])
}

// The folder store, narrowed to `names`.
function only(store: AbilityStore, names: Set<string>): AbilityStore {
  return {
    listSkills: async () => (await store.listSkills()).filter(skill => names.has(skill.name)),
    readSkill: (name, file) => (names.has(name) ? store.readSkill(name, file) : Promise.resolve(undefined)),
    listHttpTools: async () => (await store.listHttpTools()).filter(ability => names.has(ability.name)),
    listMcpAbilities: async () => (await store.listMcpAbilities()).filter(ability => names.has(ability.name)),
    listCodeTools: store.listCodeTools && (async () => (await store.listCodeTools?.(names)) ?? [])
  }
}

/**
 * Opens this computer for cloud turns: loads and connects the abilities {@link computerAbilities} picks (an MCP server
 * has to be connected to know its tools), and describes them, the file builtins and, opted in, the shell, as the turn's
 * declarations. Personas go along when they need a computer: your own, and local-only ones.
 */
export async function openComputer(): Promise<Computer> {
  const { createFolderAbilityStore, createTools, loadAbilities, toolName } = await import("@kaja/nasi")
  const root = getMarketplaceDir()
  const personas = await loadPersonas()
  const names = await computerAbilities(root)
  const { abilities: keys } = await secrets()
  const store = only(createFolderAbilityStore({ root }), names)
  const loaded = await loadAbilities(store, {
    personas,
    getApiKey: name => keys[name]?.api_key,
    allowPrivate: true
  })
  const created = await createTools({
    includeLocalTools: true,
    // Not load_skill (the one group without a source): the cloud's own hands this computer's skills back here.
    extraTools: loaded.groups.filter(group => group.source !== undefined),
    mcpAbilities: loaded.mcp,
    // Up front, with every persona's folders (as the doctor connects), so a roots-taking server lists its tools too.
    lazyMcpAbilities: false,
    backupDir: getBackupDir(),
    deps: { tempDir: getPaths().temp }
  })
  let tools = created.tools
  const shell = (await toolHosts())[SHELL_HOST_KEY] === "computer"
  const builtins = new Set([...FILE_BUILTINS, ...(shell ? [SHELL] : [])])
  const offered = (tool: Tool) => (tool.source ? tool.source.startsWith("ability:") : builtins.has(toolName(tool)))
  const declared = () => tools.filter(offered)

  const own = new Set((await ownAbilities(root)).personas)
  return {
    tools: declared().map(declare),
    skills: await Promise.all((await store.listSkills()).map(async skill => declareSkill(store, skill))),
    personas: personas.filter(persona => own.has(persona.id) || persona.localOnly),
    run: async (call, approve, personaId) => {
      const ability = declared()
        .find(tool => toolName(tool) === call.name)
        ?.source?.slice("ability:".length)
      // A roots-taking server gets the turn's persona's folders before it runs.
      if (ability) tools = await created.ensureAbilities([ability], personaId)
      if (call.name === "load_skill") return { id: call.id, text: await loadSkillText(store, call.arguments) }
      const target = declared().find(tool => toolName(tool) === call.name)
      if (!target) return { id: call.id, text: `Error: ${call.name} isn't available on this computer.` }
      return { id: call.id, ...(await runHere(target, call, approve)) }
    },
    close: created.closeTools
  }
}

function declare(tool: Tool): NasiClientTool {
  const fn = tool.definition.type === "function" ? tool.definition.function : undefined
  return {
    name: fn?.name ?? "",
    description: fn?.description ?? "",
    parameters: (fn?.parameters ?? { type: "object", properties: {} }) as Record<string, unknown>,
    ...(tool.source?.startsWith("ability:") ? { ability: tool.source.slice("ability:".length) } : {})
  }
}

async function declareSkill(
  store: AbilityStore,
  skill: { name: string; description: string; files: string[]; sticky?: boolean }
): Promise<NasiClientSkill> {
  const body = skill.sticky ? await store.readSkill(skill.name) : undefined
  return {
    name: skill.name,
    description: skill.description,
    files: skill.files,
    ...(skill.sticky ? { sticky: true } : {}),
    ...(body ? { body } : {})
  }
}

// load_skill for one of this computer's skills: its body, or one of its files.
async function loadSkillText(store: AbilityStore, argumentsJson: string): Promise<string> {
  const args = parseArgs(argumentsJson) as { name?: string; file?: string } | undefined
  if (!args?.name) return "Error: load_skill needs a skill name."
  const text = await store.readSkill(args.name, args.file).catch(error => `Error: ${(error as Error).message}`)
  return text ?? `No skill or file named "${args.file ?? args.name}" on this computer.`
}

function parseArgs(json: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(json || "{}")
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

// Runs one tool here as `--local` would: the shell's safe list and every tool's own approval rule decide when to ask.
async function runHere(target: Tool, call: NasiClientCall, approve: Approve): Promise<Omit<NasiToolResult, "id">> {
  const { checkToolArgs } = await import("@kaja/nasi")
  const args = parseArgs(call.arguments)
  if (!args) return { text: `Error: the arguments for ${call.name} aren't valid JSON.` }
  if (call.name === SHELL) return { text: await runCommandHere(args, approve) }
  const checked = checkToolArgs(target, args)
  if (!checked.ok) return { text: `Error: ${checked.error}` }
  const summary = target.approval?.(checked.args)
  if (summary !== undefined && !(await approve({ kind: "tool", name: call.name, summary })))
    return { text: "User declined this request." }
  try {
    const result = await target.execute(checked.args)
    if (typeof result === "string") return { text: result }
    const images = await Promise.all(
      (result.images ?? []).map(async image => ({
        data: (await readFile(image.path)).toString("base64"),
        mimeType: image.mimeType
      }))
    )
    return { text: result.text, ...(images.length ? { images: images.slice(0, 4) } : {}) }
  } catch (error) {
    log.warn("A cloud turn's call failed on this computer", { tool: call.name, error })
    return { text: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// run_command here: commands.toml's safe list runs at once, anything else asks first.
async function runCommandHere(args: Record<string, unknown>, approve: Approve): Promise<string> {
  const { isSafeCommand, runShellCommand } = await import("@kaja/nasi")
  const command = typeof args.command === "string" ? args.command : ""
  if (!command) return "Invalid run_command arguments."
  const { loadSafeCommands } = await import("../config/commands")
  const safe = isSafeCommand(command, await loadSafeCommands())
  if (!safe && !(await approve({ kind: "command", command }))) return "User declined to run this command."
  return runShellCommand(command)
}
