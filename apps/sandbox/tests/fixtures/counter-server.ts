// A stdio MCP server for the sandbox tests: `count` remembers how often it ran, `whoami` shows the env it got.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

let count = 0
const server = new McpServer({ name: "counter", version: "1.0.0" })
server.registerTool("count", { description: "Counts its calls" }, async () => ({
  content: [{ type: "text", text: String(++count) }]
}))
server.registerTool("whoami", { description: "The server's HOME and a leaked secret, if any" }, async () => ({
  content: [
    { type: "text", text: JSON.stringify({ home: process.env.HOME, secret: process.env.SANDBOX_SECRET ?? null }) }
  ]
}))
await server.connect(new StdioServerTransport())
