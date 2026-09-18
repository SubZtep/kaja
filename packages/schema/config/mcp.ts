import * as z from "zod"

// Names this server needs from secrets.toml's [mcp.<id>]; kaja doctor asks for any that are missing.
const RequiredSecretsSchema = z.array(z.string().min(1)).optional()

const StdioServerSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  secrets: RequiredSecretsSchema.describe("Env names this server needs from secrets.toml's [mcp.<id>]")
})

const HttpServerSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  headers: z.record(z.string(), z.string()).default({}),
  secrets: RequiredSecretsSchema.describe("Header names this server needs from secrets.toml's [mcp.<id>]")
})

const McpServerSchema = z.union([StdioServerSchema, HttpServerSchema])

export const McpFileSchema = z.object({
  servers: z.array(McpServerSchema).default([])
})

export type KajaMcpFile = z.infer<typeof McpFileSchema>
export type McpServerEntry = z.infer<typeof McpServerSchema>
