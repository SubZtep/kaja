import { z } from "zod"
import { GeoLocationSchema } from "./geo"

/**
 * Config schema for the CLI.\
 * Location: `/home/user/.config/kaja/config.json`
 */
export const configSchema = z.object({
  id: z.uuidv7().optional(),
  /** @example "andras-macbook" */
  name: z.string()
})

export const commandResultSchema = z.object({
  commandId: z.uuidv7(),
  status: z.enum(["completed", "failed", "timeout"]),
  result: z.unknown().optional(),
  error: z.string().optional(),
  exitCode: z.number().int().optional()
})

export const heartbeatRequestSchema = z.object({
  nodeId: z.uuidv7(),
  status: z.enum(["idle", "busy"]),
  currentJobId: z.uuidv7().optional(),
  commandResults: z.array(commandResultSchema).optional()
})

export const pendingCommandSchema = z.object({
  commandId: z.uuidv7(),
  command: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  timeoutSeconds: z.number().int().default(300)
})

export const heartbeatResponseSchema = z.object({
  ok: z.boolean(),
  pollIntervalMs: z.number().int().optional(),
  commands: z.array(pendingCommandSchema).optional()
})

export const connectNodeRequestSchema = z.object({
  // nodeId: z.uuidv7().optional(),
  /** @example "andras-macbook" */
  name: z.string()
  // /** For node geo location tracking. */
  // ip: z.ipv4().optional()
})

export const connectNodeResponseSchema = z.object({
  /** server generated or confirmed id */
  nodeId: z.uuidv7(),
  /** @example 2000 */
  pollIntervalMs: z.number().int()
})

export const disconnectNodeRequestSchema = z.object({
  nodeId: z.uuidv7().optional()
})

export const createCommandRequestSchema = z.object({
  command: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).default(300)
})

export const commandSchema = z.object({
  id: z.uuidv7(),
  nodeId: z.uuidv7(),
  command: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  timeoutSeconds: z.number().int(),
  status: z.enum(["pending", "executing", "completed", "failed", "timeout"]),
  createdAt: z.coerce.date(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  exitCode: z.number().int().optional(),
  createdBy: z.uuidv7().optional()
})

export const nodeStatusSchema = z.enum(["idle", "busy", "inactive"])

export const nodeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  lastSeen: z.coerce.date(),
  geoLocation: GeoLocationSchema.nullable(),
  status: nodeStatusSchema
})

export const listNodesResponseSchema = z.array(nodeSchema)

export type Config = z.infer<typeof configSchema>
export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>
export type ConnectNodeRequest = z.infer<typeof connectNodeRequestSchema>
export type ConnectNodeResponse = z.infer<typeof connectNodeResponseSchema>
export type DisconnectNodeRequest = z.infer<typeof disconnectNodeRequestSchema>
export type CommandResult = z.infer<typeof commandResultSchema>
export type PendingCommand = z.infer<typeof pendingCommandSchema>
export type CreateCommandRequest = z.infer<typeof createCommandRequestSchema>
export type Command = z.infer<typeof commandSchema>
export type NodeStatus = z.infer<typeof nodeStatusSchema>
export type Node = z.infer<typeof nodeSchema>
export type ListNodesResponse = z.infer<typeof listNodesResponseSchema>
