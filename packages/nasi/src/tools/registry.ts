import type { McpServerEntry } from "@kaja/schema/config"
import { type McpAbilityTarget, mountFolders } from "../abilities/mcp-ability"
import { askUserTool, runCommandTool, switchPersonaTool } from "../agent/agent"
import { type Tool, type ToolOrigin, toolName } from "../agent/tools"
import { connectMcpServer, type McpConnectOptions } from "../mcp/client"
import { mcpRoots, type RootFolder, readOnlyRefusal } from "../mcp/roots"
import type { FetchLike } from "../security/ssrf"
import { warn } from "../warn"
import { currentTimeTool } from "./builtin/current-time"
import { datasetInfoTool } from "./builtin/dataset-info"
import { fetchUrlTool } from "./builtin/fetch-url"
import { generateImageTool } from "./builtin/generate-image"
import { listFilesTool } from "./builtin/list-files"
import { forgetNoteTool, listNotesTool, recallMemoryTool, rememberNoteTool } from "./builtin/memory"
import { readFileTool } from "./builtin/read-file"
import { rerankTool } from "./builtin/rerank"
import { summarizeTool } from "./builtin/summarize"
import { viewImageTool } from "./builtin/view-image"
import type { NasiToolDeps } from "./deps"
import { setToolDeps } from "./deps"

/** Builtins safe to expose when `includeLocalTools` is false (cloud mode) — an allowlist so a new builtin is cloud-exposed only once someone opts it in here, not by default. */
const CLOUD_SAFE = new Set([
  "ask_user",
  "switch_persona",
  "remember_note",
  "recall_memory",
  "forget_note",
  "list_notes",
  "dataset_info",
  "current_time",
  "summarize",
  "rerank",
  // Only ever reaches a cloud turn with `fetchProxy` set — see the conditional in `builtin` below.
  "fetch_url",
  "generate_image"
])

/** Builtins that stay visible to the model in cloud mode but must run on the client, not the server — the server has no access to the user's machine. See `Tool.requiresClientExecution`. */
const CLIENT_EXECUTABLE = new Set(["read_file", "list_files"])

function toClientExecutableStub(t: Tool): Tool {
  return {
    definition: t.definition,
    requiresClientExecution: true,
    execute: () => Promise.reject(new Error(`${toolName(t)} should be intercepted by run(), not executed server-side`))
  }
}

export type CreateToolsOptions = {
  /** Files, shell and MCP. Default false. */
  includeLocalTools?: boolean
  /** Cloud only: a client can answer a `client_tool_call` pause (the terminal), so `read_file`/`list_files` are offered as stubs. False (widget, Telegram) leaves them out. Default true. */
  clientTools?: boolean
  deps?: NasiToolDeps
  tempDir?: string
  /** Tools the host brings in besides the builtins, e.g. `loadAbilities`' groups. Merged under the same name rules. */
  extraTools?: ToolGroup[]
  /**
   * MCP servers from abilities (`loadAbilities`' `mcp`), connected as community tools.
   * In the cloud (`includeLocalTools` false) only these connect, and only remote (http/sse) ones, through `mcpFetch`,
   * with images dropped and results capped.
   */
  mcpAbilities?: McpAbilityTarget[]
  /** Abilities' MCP servers connect only when `ensureAbilities` names them (a persona that uses them is active), not up front. Default false. */
  lazyMcpAbilities?: boolean
  /** How long each MCP server gets to connect and list its tools before it's skipped. Default 10 s. */
  mcpConnectTimeoutMs?: number
  /** Fetch for cloud MCP connections (the SSRF-guarded one); cloud MCP abilities don't connect without it. */
  mcpFetch?: FetchLike
  /** Cloud only: where MCP image results (screenshots) are saved for the model to see; unset drops them. Kept apart from `tempDir`, which sets the process-wide tool deps. */
  mcpImageDir?: string
}

const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 10_000
/** What a cloud MCP result may hand the model, like an HTTP tool's body. */
const CLOUD_MCP_MAX_RESULT_CHARS = 32 * 1024
/** The largest MCP image a cloud turn keeps; it's stored with the session and sent to the model on every later round. */
const CLOUD_MCP_MAX_IMAGE_BYTES = 1536 * 1024
/** A sandboxed server may have to start first (a browser, say), so it gets longer than the usual connect timeout. */
const SANDBOX_MCP_CONNECT_TIMEOUT_MS = 30_000

/** Tools that share an origin (and, for non-official ones, usually a source) on their way into {@link mergeTools}. */
export type ToolGroup = {
  origin: ToolOrigin
  /** Stamped on every tool in the group; when unset, each tool keeps its own `source`. */
  source?: string
  tools: Tool[]
}

/** A tool left out of the model's list because its name was already in use. */
export type SkippedTool = {
  name: string
  origin: ToolOrigin
  source?: string
  /** `reserved`: an official tool has the name. `taken`: another non-official tool got there first. */
  reason: "reserved" | "taken"
  takenBy?: string
}

const ORIGIN_ORDER: ToolOrigin[] = ["official", "community"]

/**
 * One namespace for every tool: stamps each group's origin/source onto its tools and drops
 * duplicate names, so the model never gets two functions with the same name. Official names
 * are reserved; among the others, the first one in wins.
 */
export function mergeTools(groups: ToolGroup[]): { tools: Tool[]; skipped: SkippedTool[] } {
  const ordered = groups.toSorted((a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin))
  const byName = new Map<string, Tool>()
  const skipped: SkippedTool[] = []

  for (const group of ordered) {
    for (const t of group.tools) {
      const stamped: Tool = { ...t, origin: group.origin, source: group.source ?? t.source }
      const name = toolName(t)
      const existing = byName.get(name)
      if (!existing) {
        byName.set(name, stamped)
        continue
      }
      const entry: SkippedTool = {
        name,
        origin: group.origin,
        source: stamped.source,
        reason: existing.origin === "official" ? "reserved" : "taken",
        takenBy: existing.source
      }
      skipped.push(entry)
      warn("Skipping a tool whose name is already in use", entry)
    }
  }

  return { tools: [...byName.values()], skipped }
}

type McpConnection = {
  tools: Tool[]
  close: () => Promise<void>
  rootsChanged: () => Promise<void>
  failed: boolean
  id: string
}

type McpTarget = {
  id: string
  server: McpServerEntry
  opts?: McpConnectOptions
  timeoutMs?: number
  /** A roots-taking server's folders by persona id (see `McpAbilityTarget.roots`). */
  roots?: Record<string, RootFolder[]>
  /** Its tools' path arguments, checked against read-only roots. */
  pathArgs?: string[]
}

/** Connects one server, giving up after `timeoutMs` (or the target's own); a connection that turns up late is closed rather than left running. */
async function connectWithTimeout(
  target: McpTarget,
  tempDir: string,
  defaultTimeoutMs: number
): Promise<McpConnection> {
  const timeoutMs = target.timeoutMs ?? defaultTimeoutMs
  const pending = connectMcpServer(target.server, tempDir, target.opts)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)
  })
  try {
    const connected = await Promise.race([pending, timeout])
    return { ...connected, failed: false, id: target.id }
  } catch (error) {
    pending.then(late => late.close()).catch(() => {})
    warn("Failed to connect to MCP server", {
      server: target.id,
      error: error instanceof Error ? error.message : error
    })
    return { tools: [], close: async () => {}, rootsChanged: async () => {}, failed: true, id: target.id }
  } finally {
    clearTimeout(timer)
  }
}

/** Every server at once, so one slow or offline server can't hold up the others (or startup) past the timeout. */
function connectMcpServers(targets: McpTarget[], tempDir: string, timeoutMs: number): Promise<McpConnection[]> {
  return Promise.all(targets.map(target => connectWithTimeout(target, tempDir, timeoutMs)))
}

/** Names of builtin tools a cloud turn would actually run given `deps` — same filtering `createTools` applies for `includeLocalTools: false`, without connecting anything. */
export async function listCloudToolNames(deps?: NasiToolDeps): Promise<string[]> {
  const { tools } = await createTools({ deps })
  return tools.map(toolName)
}

export async function createTools(opts: CreateToolsOptions = {}) {
  if (opts.deps) setToolDeps({ ...opts.deps, tempDir: opts.tempDir ?? opts.deps.tempDir })

  const local = opts.includeLocalTools === true

  const builtin: Tool[] = [
    readFileTool,
    listFilesTool,
    // Local fetches from the user's own machine; cloud egresses from the server, so it needs a proxy configured or it stays off.
    ...(local || opts.deps?.fetchProxy ? [fetchUrlTool] : []),
    viewImageTool,
    summarizeTool,
    rerankTool,
    currentTimeTool,
    askUserTool,
    runCommandTool,
    switchPersonaTool,
    rememberNoteTool,
    recallMemoryTool,
    forgetNoteTool,
    listNotesTool,
    datasetInfoTool,
    ...(opts.deps?.imageGeneration ? [generateImageTool] : [])
  ]

  const clientTools = opts.clientTools !== false
  const official = local
    ? builtin
    : builtin
        .filter(t => CLOUD_SAFE.has(toolName(t)) || (clientTools && CLIENT_EXECUTABLE.has(toolName(t))))
        .map(t => (CLIENT_EXECUTABLE.has(toolName(t)) ? toClientExecutableStub(t) : t))
  const tempDir = opts.tempDir ?? opts.deps?.tempDir

  // The cloud never runs a command on the server (the sandbox runs stdio ones behind a url), and never connects without the guarded fetch.
  const cloudAbilities = opts.mcpFetch ? (opts.mcpAbilities ?? []).filter(target => "url" in target.server) : []
  const abilities = local ? (opts.mcpAbilities ?? []) : cloudAbilities
  const abilityIds = new Set(abilities.map(target => `ability:${target.name}`))
  const cloudOpts: McpConnectOptions = {
    fetch: opts.mcpFetch,
    images: opts.mcpImageDir !== undefined,
    maxImageBytes: CLOUD_MCP_MAX_IMAGE_BYTES,
    maxResultChars: CLOUD_MCP_MAX_RESULT_CHARS
  }
  const mcpTargets: McpTarget[] = abilities.map(target => ({
    id: `ability:${target.name}`,
    server: target.server,
    opts: {
      transport: target.transport === "sse" ? ("sse" as const) : ("http" as const),
      allow: target.allow,
      approval: target.approval,
      readOnly: target.readOnly,
      label: `ability:${target.name}`,
      ...(local ? {} : { ...cloudOpts, hideArgs: target.localOnlyArgs })
    },
    ...(target.sandboxed ? { timeoutMs: Math.max(opts.mcpConnectTimeoutMs ?? 0, SANDBOX_MCP_CONNECT_TIMEOUT_MS) } : {}),
    ...(target.roots ? { roots: target.roots, pathArgs: target.pathArgs } : {})
  }))
  // A roots-taking server's folders now: the active persona's (every persona's before one is known, as the doctor connects).
  const currentRoots = new Map<string, RootFolder[]>()
  for (const target of mcpTargets) {
    if (!target.roots) continue
    currentRoots.set(target.id, mountFolders(target.roots))
    target.opts = {
      ...target.opts,
      roots: () => mcpRoots(currentRoots.get(target.id) ?? []),
      refuse: args => readOnlyRefusal(currentRoots.get(target.id) ?? [], target.pathArgs ?? [], args)
    }
  }
  // Image results land in the temp dir locally, and in `mcpImageDir` in the cloud (dropped without one).
  const mcpImagesDir = local ? tempDir : (opts.mcpImageDir ?? "")
  const connectTimeoutMs = opts.mcpConnectTimeoutMs ?? DEFAULT_MCP_CONNECT_TIMEOUT_MS
  // One connection per target, started at most once, so callers asking for the same ability at once share it.
  const connecting = new Map<string, Promise<McpConnection>>()
  const connect = async (targets: McpTarget[]): Promise<void> => {
    if (mcpImagesDir === undefined) return
    const fresh = targets.filter(target => !connecting.has(target.id))
    const started = connectMcpServers(fresh, mcpImagesDir, connectTimeoutMs)
    fresh.forEach((target, index) =>
      connecting.set(
        target.id,
        started.then(all => all[index]!)
      )
    )
    await Promise.all(targets.map(target => connecting.get(target.id)!))
  }
  // Abilities' servers connect now, unless they wait for ensureAbilities.
  if (!opts.lazyMcpAbilities) await connect(mcpTargets)

  const connections = async () => Promise.all(connecting.values())
  const merge = async () =>
    mergeTools([
      { origin: "official", tools: official },
      ...(opts.extraTools ?? []),
      ...(await connections()).map(c => ({ origin: "community" as const, source: c.id, tools: c.tools }))
    ])
  let merged = await merge()
  const mcpServers = async () =>
    (await connections()).map(c => ({ id: c.id, toolCount: c.tools.length, failed: c.failed }))
  const initialServers = await mcpServers()

  return {
    tools: merged.tools,
    skipped: merged.skipped,
    mcpServers: initialServers,
    closeTools: async () => {
      await Promise.all((await connections()).map(c => c.close()))
    },
    /**
     * Connects the MCP servers of the named abilities (every ability's when `names` is unset) that haven't been tried
     * yet (see `lazyMcpAbilities`) and returns every tool, theirs included. A server that fails stays failed; names
     * without an MCP ability are ignored. A roots-taking server gets `personaId`'s folders (told when they change);
     * for a persona that gives it none it isn't started, and its tools are left out of the list, as are its tools
     * that may write when every folder the persona gives it is read-only.
     */
    ensureAbilities: async (names?: Iterable<string>, personaId?: string): Promise<Tool[]> => {
      const wanted = names && new Set([...names].map(name => `ability:${name}`))
      const rootless = new Set<string>()
      const readOnly = new Set<string>()
      const changed: string[] = []
      const paths = (roots: RootFolder[] | undefined) => roots?.map(root => root.folder).join("\n")
      for (const target of mcpTargets) {
        if (!target.roots) continue
        const folders = (personaId !== undefined && target.roots[personaId]) || []
        if (folders.length === 0) {
          rootless.add(target.id)
          continue
        }
        if (folders.every(root => root.readOnly)) readOnly.add(target.id)
        // Only the folders reach the server; which are read-only is Kaja's to check.
        if (paths(folders) !== paths(currentRoots.get(target.id))) changed.push(target.id)
        currentRoots.set(target.id, folders)
      }
      // A server that starts now asks for its roots itself; one already running has to be told they changed.
      const running = new Set(connecting.keys())
      await connect(
        mcpTargets.filter(
          target => abilityIds.has(target.id) && (!wanted || wanted.has(target.id)) && !rootless.has(target.id)
        )
      )
      await Promise.all(
        changed
          .filter(id => running.has(id))
          .map(async id =>
            (await connecting.get(id))
              ?.rootsChanged()
              .catch(error =>
                warn("Couldn't tell an MCP server its roots changed", { server: id, error: String(error) })
              )
          )
      )
      merged = await merge()
      return merged.tools.filter(
        tool => !tool.source || !(rootless.has(tool.source) || (readOnly.has(tool.source) && !tool.readOnly))
      )
    }
  }
}
