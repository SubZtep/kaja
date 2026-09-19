// A tiny stdio MCP server for tests: one read-only tool, one that writes, one that echoes its env key.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import * as z from "zod"

const server = new McpServer({ name: "fixture", version: "1.0.0" })

server.registerTool(
  "read_thing",
  { description: "Reads a thing", inputSchema: { id: z.string() }, annotations: { readOnlyHint: true } },
  async ({ id }) => ({ content: [{ type: "text", text: `thing ${id}` }] })
)
server.registerTool(
  "write_thing",
  { description: "Writes a thing", inputSchema: { id: z.string() } },
  async ({ id }) => ({ content: [{ type: "text", text: `wrote ${id}` }] })
)
server.registerTool("echo_key", { description: "Echoes FIXTURE_KEY", inputSchema: {} }, async () => ({
  content: [{ type: "text", text: process.env.FIXTURE_KEY ?? "none" }]
}))

await server.connect(new StdioServerTransport())
