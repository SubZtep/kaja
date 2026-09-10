import { warn } from "@kaja/logger"
import type { McpServerEntry } from "@kaja/schema/config"
import { askUserTool, runCommandTool, switchPersonaTool } from "../agent/agent"
import { type Tool, toolName } from "../agent/tools"
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

/** Builtins safe to expose when `includeLocalTools` is false (hosted mode) — an allowlist so a new builtin is hosted-exposed only once someone opts it in here, not by default. */
const HOSTED_SAFE = new Set([
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
  // Only ever reaches a hosted turn with `fetchProxy` set — see the conditional in `builtin` below.
  "fetch_url",
  "web_search",
  "generate_image"
])

export type CreateToolsOptions = {
  /** Files, shell, MCP, and plugins. Default false. */
  includeLocalTools?: boolean
  deps?: NasiToolDeps
  mcpServers?: McpServerEntry[]
  pluginDir?: string
  tempDir?: string
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

/** Names of builtin tools a hosted turn would actually run given `deps` — same filtering `createTools` applies for `includeLocalTools: false`, without connecting MCP/plugins (hosted never does). */
export async function listHostedToolNames(deps?: NasiToolDeps): Promise<string[]> {
  const { tools } = await createTools({ deps })
  return tools.map(toolName)
}

export async function createTools(opts: CreateToolsOptions = {}) {
  if (opts.deps) setToolDeps({ ...opts.deps, tempDir: opts.tempDir ?? opts.deps.tempDir })

  const local = opts.includeLocalTools === true

  const builtin: Tool<any>[] = [
    readFileTool,
    listFilesTool,
    // Local fetches from the user's own machine; hosted egresses from the server, so it needs a proxy configured or it stays off.
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

  const tools = local ? builtin : builtin.filter(t => HOSTED_SAFE.has(toolName(t)))
  const tempDir = opts.tempDir ?? opts.deps?.tempDir

  const mcpConnections = local && opts.mcpServers && tempDir ? await connectMcpServers(opts.mcpServers, tempDir) : []

  const pluginTools = local && opts.pluginDir ? await loadPluginTools(opts.pluginDir) : []

  return {
    tools: [...tools, ...mcpConnections.flatMap(c => c.tools), ...pluginTools],
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
