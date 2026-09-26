import { z } from "zod"

/** One MCP server the sandbox runs for a user: `starting` until its process is up; `rss` is its whole process tree (a browser's too) in bytes, null where it can't be read. */
export const sandboxServerStatsSchema = z.object({
  user: z.string(),
  ability: z.string(),
  state: z.enum(["starting", "running"]),
  pid: z.number().int().nullable(),
  rss: z.number().int().nullable(),
  /** Calls waiting on the server right now. */
  pending: z.number().int(),
  /** Open Streamable HTTP sessions (about one per recent turn). */
  sessions: z.number().int(),
  startedAt: z.coerce.date(),
  lastUsed: z.coerce.date()
})

/** What the MCP sandbox is doing right now (`GET /stats` on the sandbox); the counters count since it started. */
export const sandboxStatsSchema = z.object({
  startedAt: z.coerce.date(),
  /** The abilities it can run. */
  abilities: z.array(z.string()),
  limits: z.object({ maxProcesses: z.number().int(), idleMs: z.number().int() }),
  host: z.object({
    cpus: z.number().int(),
    /** 1, 5 and 15 minute load averages. */
    loadAvg: z.array(z.number()),
    totalMemory: z.number(),
    freeMemory: z.number(),
    /** The container's memory (cgroup v2) in bytes, `max` null when unlimited; null outside one. */
    container: z.object({ current: z.number(), max: z.number().nullable() }).nullable()
  }),
  /** The sandbox's own process, without the servers it runs. */
  process: z.object({ rss: z.number(), heapUsed: z.number() }),
  servers: z.array(sandboxServerStatsSchema),
  pool: z.object({
    started: z.number().int(),
    failedToStart: z.number().int(),
    stoppedIdle: z.number().int(),
    /** Stopped early so another user's server could start. */
    madeRoom: z.number().int(),
    crashed: z.number().int(),
    /** Turned away with every server mid-call. */
    refusedFull: z.number().int()
  }),
  /** The browsers' egress proxy: connections open now, and ones let through, refused (a private or unknown address, a bad request) and failed upstream. */
  egress: z.object({
    open: z.number().int(),
    allowed: z.number().int(),
    refused: z.number().int(),
    failed: z.number().int()
  })
})

/** `GET /admin/sandbox`: `off` without a configured sandbox, `down` when it didn't answer, else its stats and the emails of the users in them. */
export const adminSandboxResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("off") }),
  z.object({ status: z.literal("down"), error: z.string() }),
  z.object({ status: z.literal("up"), stats: sandboxStatsSchema, emails: z.record(z.string(), z.string()) })
])

export type SandboxServerStats = z.infer<typeof sandboxServerStatsSchema>
export type SandboxStats = z.infer<typeof sandboxStatsSchema>
export type AdminSandboxResponse = z.infer<typeof adminSandboxResponseSchema>
