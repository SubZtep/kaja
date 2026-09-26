// A stdio MCP server for the sandbox tests: `count` remembers how often it ran, `whoami` shows the env it got, `picture` returns an image, `crash` complains on stderr and exits.
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
// A 1×1 PNG, like a screenshot the cloud has to hand back to its client.
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
server.registerTool("picture", { description: "Returns a tiny picture" }, async () => ({
  content: [
    { type: "text", text: "a picture" },
    { type: "image", data: PIXEL, mimeType: "image/png" }
  ]
}))
server.registerTool("crash", { description: "Exits mid-call" }, async () => {
  console.error("counter: out of cheese")
  setTimeout(() => process.exit(1), 50)
  return new Promise(() => {})
})
await server.connect(new StdioServerTransport())
