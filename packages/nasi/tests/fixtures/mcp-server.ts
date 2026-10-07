// A tiny stdio MCP server for tests: one read-only tool, one that writes, one that echoes its env key, one that lists its roots.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js"
import * as z from "zod"

const server = new McpServer({ name: "fixture", version: "1.0.0" })

server.registerTool(
  "read_thing",
  { description: "Reads a thing", inputSchema: { id: z.string() }, annotations: { readOnlyHint: true } },
  ({ id }) => ({ content: [{ type: "text", text: `thing ${id}` }] })
)
server.registerTool("write_thing", { description: "Writes a thing", inputSchema: { id: z.string() } }, ({ id }) => ({
  content: [{ type: "text", text: `wrote ${id}` }]
}))
server.registerTool("echo_key", { description: "Echoes FIXTURE_KEY", inputSchema: {} }, () => ({
  content: [{ type: "text", text: process.env.FIXTURE_KEY ?? "none" }]
}))

server.registerTool(
  "list_roots",
  { description: "Lists the client's roots", inputSchema: {}, annotations: { readOnlyHint: true } },
  async () => ({
    content: [{ type: "text", text: (await server.server.listRoots()).roots.map(root => root.uri).join("\n") }]
  })
)

// Like a roots-taking server: it asks for them once initialized and again when told they changed.
const askRoots = () => {
  if (server.server.getClientCapabilities()?.roots) server.server.listRoots().catch(() => {})
}
server.server.oninitialized = askRoots
server.server.setNotificationHandler(RootsListChangedNotificationSchema, askRoots)

await server.connect(new StdioServerTransport())
