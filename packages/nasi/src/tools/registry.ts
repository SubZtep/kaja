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

export type NasiProfile = "local" | "hosted"

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
  "fetch_url",
  "web_search",
  "generate_image"
])

const LOCAL_ONLY = new Set(["read_file", "list_files", "view_image", "run_command"])

export type CreateToolsOptions = {
  profile: NasiProfile
  deps?: NasiToolDeps
  mcpServers?: McpServerEntry[]
  pluginDir?: string
  tempDir?: string
}

export async function createTools(opts: CreateToolsOptions) {
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

  const tools = opts.profile === "hosted" ? builtin.filter(t => HOSTED_SAFE.has(toolName(t))) : builtin

  const mcpConnections: { tools: Tool<any>[]; close: () => Promise<void>; failed: boolean; id: string }[] = []
  if (opts.profile === "local" && opts.mcpServers && opts.tempDir) {
    for (const server of opts.mcpServers) {
      try {
        const connected = await connectMcpServer(server, opts.tempDir)
        mcpConnections.push({ ...connected, failed: false, id: server.id })
      } catch (error) {
        warn("Failed to connect to MCP server", {
          server: server.id,
          error: error instanceof Error ? error.message : error
        })
        mcpConnections.push({ tools: [], close: async () => {}, failed: true, id: server.id })
      }
    }
  }

  const pluginTools = opts.profile === "local" && opts.pluginDir ? await loadPluginTools(opts.pluginDir) : []

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

export { HOSTED_SAFE, LOCAL_ONLY }
