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

/** Files, shell, and disk-bound vision. Off unless `includeLocalTools` is set. */
const LOCAL_TOOLS = new Set(["read_file", "list_files", "view_image", "run_command"])

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

export async function createTools(opts: CreateToolsOptions = {}) {
  if (opts.deps) setToolDeps({ ...opts.deps, tempDir: opts.tempDir ?? opts.deps.tempDir })

  const builtin: Tool<any>[] = [
    readFileTool,
    listFilesTool,
    fetchUrlTool,
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

  const local = opts.includeLocalTools === true
  const tools = local ? builtin : builtin.filter(t => !LOCAL_TOOLS.has(toolName(t)))
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
