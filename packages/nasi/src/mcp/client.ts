import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { McpServerEntry } from "@kaja/schema/config"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { write } from "bun"
import { type Tool, type ToolResult, tool } from "../agent/tools"

export async function connectMcpServer(
  server: McpServerEntry,
  tempDir: string
): Promise<{ tools: Tool<any>[]; close: () => Promise<void> }> {
  const transport =
    "url" in server
      ? new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } })
      : new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: { ...process.env, ...server.env } as Record<string, string>,
          stderr: "ignore"
        })

  const client = new Client({ name: "kaja", version: "1.0.0" })
  await client.connect(transport)

  const { tools: mcpTools } = await client.listTools()
  const tools = mcpTools.map(mcpTool =>
    tool<Record<string, unknown>>({
      name: mcpTool.name,
      description: mcpTool.description ?? mcpTool.name,
      parameters: mcpTool.inputSchema,
      execute: args => callTool(client, mcpTool.name, args, tempDir)
    })
  )

  return { tools, close: () => client.close() }
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  tempDir: string
): Promise<ToolResult> {
  const result = await client.callTool({ name, arguments: args })
  const content = (result.content ?? []) as Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  >

  const text = content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map(block => block.text)
    .join("\n")

  const imageBlocks = content.filter(
    (block): block is { type: "image"; data: string; mimeType: string } => block.type === "image"
  )
  if (imageBlocks.length === 0) return { text: text || `${name}: done` }

  await mkdir(tempDir, { recursive: true })
  const images = await Promise.all(
    imageBlocks.map(async block => {
      const ext = block.mimeType.split("/")[1] ?? "png"
      const path = join(tempDir, `${randomUUID()}.${ext}`)
      await write(path, Buffer.from(block.data, "base64"))
      return { path, mimeType: block.mimeType }
    })
  )

  return { text: text || `${name}: done`, images }
}
