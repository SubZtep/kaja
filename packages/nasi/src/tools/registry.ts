import type { McpServerEntry } from "@kaja/schema/config"
import type { McpAbilityTarget } from "../abilities/mcp-ability"
import { askUserTool, runCommandTool, switchPersonaTool } from "../agent/agent"
import { type Tool, type ToolOrigin, toolName } from "../agent/tools"
import { connectMcpServer, type McpConnectOptions } from "../mcp/client"
import { loadPluginTools } from "../plugin/plugin-tools"
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

function toClientExecutableStub(t: Tool<any>): Tool<any> {
  return {
    definition: t.definition,
    requiresClientExecution: true,
    execute: async () => {
      throw new Error(`${toolName(t)} should be intercepted by run(), not executed server-side`)
    }
  }
}

export type CreateToolsOptions = {
  /** Files, shell, MCP, and plugins. Default false. */
  includeLocalTools?: boolean
  /** Cloud only: a client can answer a `client_tool_call` pause (the terminal), so `read_file`/`list_files` are offered as stubs. False (widget, Telegram) leaves them out. Default true. */
  clientTools?: boolean
  deps?: NasiToolDeps
  mcpServers?: McpServerEntry[]
  pluginDir?: string
  tempDir?: string
  /** Tools the host brings in besides the builtins, e.g. `loadAbilities`' groups. Merged under the same name rules. */
  extraTools?: ToolGroup[]
  /**
   * MCP servers from enabled abilities (`loadAbilities`' `mcp`), connected alongside `mcpServers` as community tools.
   * In the cloud (`includeLocalTools` false) only these connect, and only remote (http/sse) ones, through `mcpFetch`,
   * with images dropped and results capped.
   */
  mcpAbilities?: McpAbilityTarget[]
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
  tools: Tool<any>[]
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

const ORIGIN_ORDER: ToolOrigin[] = ["official", "community", "third-party"]

/**
 * One namespace for every tool: stamps each group's origin/source onto its tools and drops
 * duplicate names, so the model never gets two functions with the same name. Official names
 * are reserved; between the others, community beats third-party and the first one in wins.
 */
export function mergeTools(groups: ToolGroup[]): { tools: Tool<any>[]; skipped: SkippedTool[] } {
  const ordered = groups.toSorted((a, b) => ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin))
  const byName = new Map<string, Tool<any>>()
  const skipped: SkippedTool[] = []

  for (const group of ordered) {
    for (const t of group.tools) {
      const stamped: Tool<any> = { ...t, origin: group.origin, source: group.source ?? t.source }
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

type McpConnection = { tools: Tool<any>[]; close: () => Promise<void>; failed: boolean; id: string }

type McpTarget = { id: string; server: McpServerEntry; opts?: McpConnectOptions; timeoutMs?: number }

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
    return { tools: [], close: async () => {}, failed: true, id: target.id }
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

  const builtin: Tool<any>[] = [
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
  const mcpTargets: McpTarget[] = [
    ...(local ? (opts.mcpServers ?? []) : []).map(server => ({ id: server.id, server })),
    ...abilities.map(target => ({
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
      ...(target.sandboxed
        ? { timeoutMs: Math.max(opts.mcpConnectTimeoutMs ?? 0, SANDBOX_MCP_CONNECT_TIMEOUT_MS) }
        : {})
    }))
  ]
  // Image results land in the temp dir locally, and in `mcpImageDir` in the cloud (dropped without one).
  const mcpImagesDir = local ? tempDir : (opts.mcpImageDir ?? "")
  const mcpConnections =
    mcpTargets.length > 0 && mcpImagesDir !== undefined
      ? await connectMcpServers(mcpTargets, mcpImagesDir, opts.mcpConnectTimeoutMs ?? DEFAULT_MCP_CONNECT_TIMEOUT_MS)
      : []

  const pluginTools = local && opts.pluginDir ? await loadPluginTools(opts.pluginDir) : []

  const { tools, skipped } = mergeTools([
    { origin: "official", tools: official },
    ...(opts.extraTools ?? []),
    ...mcpConnections.map(c =>
      abilityIds.has(c.id)
        ? { origin: "community" as const, source: c.id, tools: c.tools }
        : { origin: "third-party" as const, source: `mcp:${c.id}`, tools: c.tools }
    ),
    // Each plugin tool already carries its own `plugin:<file>` source.
    { origin: "third-party", tools: pluginTools }
  ])

  return {
    tools,
    skipped,
    mcpServers: mcpConnections.map(c => ({
      id: c.id,
      toolCount: c.tools.length,
      failed: c.failed
    })),
    closeTools: async () => {
      await Promise.all(mcpConnections.map(c => c.close()))
    }
  }
}
