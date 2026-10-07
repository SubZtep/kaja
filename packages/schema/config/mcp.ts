import * as z from "zod"

// How to reach one MCP server: a command to start (stdio) or a URL. Built from an ability's mcp.toml, never read from a file of its own.
const StdioServerSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({})
})

const HttpServerSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  headers: z.record(z.string(), z.string()).default({})
})

export const McpServerEntrySchema = z.union([StdioServerSchema, HttpServerSchema])

export type McpServerEntry = z.infer<typeof McpServerEntrySchema>
