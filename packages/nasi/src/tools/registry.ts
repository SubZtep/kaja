import { warn } from "@kaja/logger"
import type { McpServerEntry } from "@kaja/schema/config"
import { askUserTool, runCommandTool, switchPersonaTool } from "../agent/agent"
import { type Tool, type ToolOrigin, toolName } from "../agent/tools"
import { connectMcpServer } from "../mcp/client"
import { loadPluginTools } from "../plugin/plugin-tools"
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
import { webSearchTool } from "./builtin/web-search"
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
  "web_search",
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
  deps?: NasiToolDeps
  mcpServers?: McpServerEntry[]
  pluginDir?: string
  tempDir?: string
  /** Tools the host brings in besides the builtins, e.g. `loadPackages`' groups. Merged under the same name rules. */
  extraTools?: ToolGroup[]
}

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

async function connectMcpServers(mcpServers: McpServerEntry[], tempDir: string): Promise<McpConnection[]> {
  const connections: McpConnection[] = []
  for (const server of mcpServers) {
    try {
      const connected = await connectMcpServer(server, tempDir)
      connections.push({ ...connected, failed: false, id: server.id })
    } catch (error) {
      warn("Failed to connect to MCP server", {
        server: server.id,
        error: error instanceof Error ? error.message : error
      })
      connections.push({ tools: [], close: async () => {}, failed: true, id: server.id })
    }
  }
  return connections
}

/** Names of builtin tools a cloud turn would actually run given `deps` — same filtering `createTools` applies for `includeLocalTools: false`, without connecting MCP/plugins (cloud never does). */
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
    ...(opts.deps?.webSearchApiKey ? [webSearchTool] : []),
    ...(opts.deps?.imageGeneration ? [generateImageTool] : [])
  ]

  const official = local
    ? builtin
    : builtin
        .filter(t => CLOUD_SAFE.has(toolName(t)) || CLIENT_EXECUTABLE.has(toolName(t)))
        .map(t => (CLIENT_EXECUTABLE.has(toolName(t)) ? toClientExecutableStub(t) : t))
  const tempDir = opts.tempDir ?? opts.deps?.tempDir

  const mcpConnections = local && opts.mcpServers && tempDir ? await connectMcpServers(opts.mcpServers, tempDir) : []

  const pluginTools = local && opts.pluginDir ? await loadPluginTools(opts.pluginDir) : []

  const { tools, skipped } = mergeTools([
    { origin: "official", tools: official },
    ...(opts.extraTools ?? []),
    ...mcpConnections.map(c => ({ origin: "third-party" as const, source: `mcp:${c.id}`, tools: c.tools })),
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
