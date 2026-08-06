import { z } from "zod"

const argsSchema = z.array(z.string()).default([])
const envSchema = z.record(z.string(), z.string()).default({})
const headersSchema = z.record(z.string(), z.string()).default({})

/** Exactly one of command (stdio) or url (Streamable HTTP) must be set. */
function hasExactlyOneTransport(data: { command?: string | null; url?: string | null }): boolean {
  const hasCommand = data.command != null && data.command.length > 0
  const hasUrl = data.url != null && data.url.length > 0
  return hasCommand !== hasUrl
}

export const mcpServerSchema = z.object({
  id: z.string(),
  serverId: z.string().min(1),
  command: z.string().min(1).nullable(),
  args: argsSchema,
  env: envSchema,
  url: z.url().nullable(),
  headers: headersSchema,
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createMcpServerRequestSchema = z
  .object({
    serverId: z.string().min(1),
    command: z.string().min(1).optional(),
    args: argsSchema,
    env: envSchema,
    url: z.url().optional(),
    headers: headersSchema,
    enabled: z.boolean().default(true)
  })
  .refine(hasExactlyOneTransport, {
    message: "Provide either command (local/stdio) or url (remote HTTP), not both"
  })

export const updateMcpServerRequestSchema = z.object({
  serverId: z.string().min(1).optional(),
  command: z.string().min(1).nullable().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.url().nullable().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional()
})

export const listMcpServersResponseSchema = z.object({
  mcpServers: z.array(mcpServerSchema)
})

export type McpServer = z.infer<typeof mcpServerSchema>
export type CreateMcpServerRequest = z.infer<typeof createMcpServerRequestSchema>
export type UpdateMcpServerRequest = z.infer<typeof updateMcpServerRequestSchema>
export type ListMcpServersResponse = z.infer<typeof listMcpServersResponseSchema>
