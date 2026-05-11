import { z } from "zod"

/**
 * Config schema for the CLI.\
 * Location: `/home/user/.config/kaja/config.toml`
 */
export const configSchema = z.object({
  id: z.uuidv7().optional(),
  /** @example "andras-macbook" */
  name: z.string()
})

export const heartbeatRequestSchema = z.object({
  nodeId: z.uuidv7(),
  status: z.enum(["idle", "busy", "inactive"]),
  currentJobId: z.uuidv7().optional()
})

export const heartbeatResponseSchema = z.object({
  ok: z.boolean()
})

export const spawnNodeRequestSchema = z.object({
  nodeId: z.uuidv7().optional(),
  /** @example "andras-macbook" */
  name: z.string(),
  /** For node geo location tracking. */
  ip: z.ipv4().optional()
})

export const spawnNodeResponseSchema = z.object({
  /** server generated or confirmed id */
  nodeId: z.uuidv7(),
  /** @example 2000 */
  pollIntervalMs: z.number().int()
})

export type Config = z.infer<typeof configSchema>
export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>
export type SpawnNodeRequest = z.infer<typeof spawnNodeRequestSchema>
export type SpawnNodeResponse = z.infer<typeof spawnNodeResponseSchema>
