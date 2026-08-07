import type { Tool } from "../lib/agent/agents"
import { askUserTool, runCommandTool, switchPersonaTool } from "../lib/agent/agents"
import { loadPluginTools } from "../lib/agent/plugin-tools"
import { config } from "../lib/config/config"
import { loadMcpServers } from "../lib/config/mcp-servers"
import { services } from "../lib/config/services"
import { log } from "../lib/logger"
import { connectMcpServer } from "../lib/mcp/client"
import { currentTimeTool } from "./current-time"
import { datasetInfoTool } from "./dataset-info"
import { fetchUrlTool } from "./fetch-url"
import { generateImageTool } from "./generate-image"
import { listFilesTool } from "./list-files"
import { forgetNoteTool, listNotesTool, recallMemoryTool, rememberNoteTool } from "./memory"
import { readFileTool } from "./read-file"
import { rerankTool } from "./rerank"
import { summarizeTool } from "./summarize"
import { viewImageTool } from "./view-image"
import { webSearchTool } from "./web-search"

/**
 * The toolset a chat session starts with: webSearchTool is only included
 * when its config group is present, since it's only usable with its own
 * credentials. Location is resolved once per session and grounded into the
 * system prompt (see lib/agents.ts run()), not exposed as a tool.
 *
 * Every server listed in `~/.config/kaja/mcp.toml` (see lib/mcp-servers.ts)
 * is spawned and its tools folded in — adding a server there is enough, no
 * code changes needed. Also folds in any user-supplied tools from
 * `~/.config/kaja/tools/*.ts` (see lib/plugin-tools.ts) — a way to add tools
 * locally without shipping them in this repo. Returns `closeTools` alongside
 * — the caller must call it on shutdown to let the spawned MCP subprocesses
 * exit.
 */
export async function getDefaultTools() {
  const { models } = await config()
  const { webSearch } = await services()
  const [mcpServers, pluginTools] = await Promise.all([loadMcpServers(), loadPluginTools()])
  // One broken server (bad command, unreachable URL, ...) must not take down the rest — connect each independently and fall back to no tools for that server.
  const mcpConnections = await Promise.all(
    mcpServers.map(async (server): Promise<{ tools: Tool<any>[]; close: () => Promise<void>; failed: boolean }> => {
      try {
        return { ...(await connectMcpServer(server)), failed: false }
      } catch (error) {
        log.warn({ error, server: server.id }, "Failed to connect to MCP server")
        return { tools: [], close: async () => {}, failed: true }
      }
    })
  )
  return {
    tools: [
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
      ...(webSearch ? [webSearchTool] : []),
      ...(models["image-generation"]?.provider ? [generateImageTool] : []),
      ...mcpConnections.flatMap(connection => connection.tools),
      ...pluginTools
    ],
    // Per-server tool counts for the startup panel (see components/startup-panel.tsx); failed connects show as 0 tools with a flag so the panel can mark them.
    mcpServers: mcpServers.map((server, index) => ({
      id: server.id,
      toolCount: mcpConnections[index]!.tools.length,
      failed: mcpConnections[index]!.failed
    })),
    closeTools: async () => {
      await Promise.all(mcpConnections.map(connection => connection.close()))
    }
  }
}
