import { z } from "zod"

export const mcpServerSchema = z.object({
  id: z.string(),
  serverId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createMcpServerRequestSchema = z.object({
  serverId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true)
})

export const updateMcpServerRequestSchema = z.object({
  serverId: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional()
})

export const listMcpServersResponseSchema = z.object({
  mcpServers: z.array(mcpServerSchema)
})

export type McpServer = z.infer<typeof mcpServerSchema>
export type CreateMcpServerRequest = z.infer<typeof createMcpServerRequestSchema>
export type UpdateMcpServerRequest = z.infer<typeof updateMcpServerRequestSchema>
export type ListMcpServersResponse = z.infer<typeof listMcpServersResponseSchema>
