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

/** What a sandbox tells the API about itself when it connects (the `hello` frame). */
export const sandboxInfoSchema = z.object({
  version: z.string().max(40),
  /** The operator's name for it (SANDBOX_NAME). */
  name: z.string().max(80).nullable(),
  arch: z.string().max(40),
  os: z.string().max(120),
  cpu: z.object({ model: z.string().max(200), cores: z.number().int().min(0).max(4096) }),
  /** Bytes: the host's total, and the container's cgroup limit when it has one. */
  memory: z.object({ total: z.number().nonnegative(), limit: z.number().nonnegative().nullable() }),
  maxProcesses: z.number().int().min(0).max(1000),
  /** The abilities it can run. */
  abilities: z.array(z.string().max(100)).max(200)
})

/** How busy a sandbox is, sent every minute (the `heartbeat` frame). */
export const sandboxLoadSchema = z.object({
  /** Servers running or starting. */
  running: z.number().int().min(0),
  /** The 1 minute load average. */
  load: z.number().nonnegative(),
  /** Bytes in use: the container's when it's in one, else the host's. */
  memoryUsed: z.number().nonnegative()
})

const frameId = z.string().min(1).max(40)

/** Frames a sandbox sends the API over its WebSocket: who it is, how busy it is, and its answers to `request`/`stats`. */
export const sandboxFrameSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), info: sandboxInfoSchema }),
  z.object({ t: z.literal("heartbeat"), load: sandboxLoadSchema }),
  z.object({
    t: z.literal("head"),
    id: frameId,
    status: z.number().int().min(100).max(599),
    headers: z.array(z.tuple([z.string(), z.string()])).max(100)
  }),
  /** A piece of the response body, base64. */
  z.object({ t: z.literal("chunk"), id: frameId, data: z.string() }),
  z.object({ t: z.literal("end"), id: frameId }),
  z.object({ t: z.literal("error"), id: frameId, message: z.string().max(500) }),
  z.object({ t: z.literal("stats"), id: frameId, stats: sandboxStatsSchema })
])

/** Frames the API sends a sandbox: its identity, MCP requests to run (for an opaque `user`), cancels and stats requests. */
export const apiSandboxFrameSchema = z.discriminatedUnion("t", [
  /** `secret` only when the API made a new row: the sandbox keeps it to come back as the same one. */
  z.object({ t: z.literal("welcome"), id: z.string(), secret: z.string().optional() }),
  z.object({
    t: z.literal("request"),
    id: frameId,
    user: z.string(),
    ability: z.string(),
    method: z.string(),
    headers: z.array(z.tuple([z.string(), z.string()])),
    /** The request body, base64. */
    body: z.string().nullable()
  }),
  z.object({ t: z.literal("cancel"), id: frameId }),
  z.object({ t: z.literal("stats"), id: frameId })
])

/** Headers a sandbox connects with: the owner's sandbox key (none: anonymous) and the `<id>.<secret>` it was welcomed with before. */
export const SANDBOX_KEY_HEADER = "x-kaja-sandbox-key"
export const SANDBOX_INSTANCE_HEADER = "x-kaja-sandbox-instance"

/** A registered sandbox: `official` is the operator's own box, `owned` a user's, `anonymous` one started without a key. */
export const sandboxSchema = z.object({
  id: z.string(),
  kind: z.enum(["official", "owned", "anonymous"]),
  ownerId: z.string().nullable(),
  name: z.string().nullable(),
  online: z.boolean(),
  connectedAt: z.coerce.date().nullable(),
  lastSeenAt: z.coerce.date().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  city: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  info: sandboxInfoSchema.nullable(),
  load: sandboxLoadSchema.nullable(),
  createdAt: z.coerce.date()
})

/** One sandbox on the admin dashboard: its row, and its live stats while it's online (`error` when it didn't answer). */
export const adminSandboxEntrySchema = z.object({
  sandbox: sandboxSchema,
  stats: sandboxStatsSchema.nullable(),
  error: z.string().nullable()
})

/** `GET /admin/sandbox`: every registered sandbox, online first, and the emails of the owners and of the users in their stats. */
export const adminSandboxResponseSchema = z.object({
  sandboxes: z.array(adminSandboxEntrySchema),
  emails: z.record(z.string(), z.string())
})

/** A user's sandbox settings: others may use theirs (`share`), they may use others' (`useShared`), and whether they have a key yet. */
export const sandboxSettingsSchema = z.object({
  share: z.boolean(),
  useShared: z.boolean(),
  hasKey: z.boolean(),
  keyCreatedAt: z.coerce.date().nullable()
})

/** `PATCH /sandbox/settings`. */
export const sandboxSettingsPatchSchema = z.object({ share: z.boolean().optional(), useShared: z.boolean().optional() })

/** `GET /sandbox`: the signed-in user's settings and own sandboxes. */
export const mySandboxesResponseSchema = z.object({
  settings: sandboxSettingsSchema,
  sandboxes: z.array(sandboxSchema)
})

/** `POST /sandbox/key`: a new key, shown this once (only its hash is kept); it replaces the old one. */
export const sandboxKeyResponseSchema = z.object({ key: z.string() })

/** `GET /sandbox/public`: how many sandboxes are online, and in which countries. */
export const publicSandboxesResponseSchema = z.object({
  online: z.number().int(),
  countries: z.array(z.object({ code: z.string(), name: z.string(), count: z.number().int() }))
})

export type SandboxServerStats = z.infer<typeof sandboxServerStatsSchema>
export type SandboxStats = z.infer<typeof sandboxStatsSchema>
export type SandboxInfo = z.infer<typeof sandboxInfoSchema>
export type SandboxLoad = z.infer<typeof sandboxLoadSchema>
export type SandboxFrame = z.infer<typeof sandboxFrameSchema>
export type ApiSandboxFrame = z.infer<typeof apiSandboxFrameSchema>
export type Sandbox = z.infer<typeof sandboxSchema>
export type AdminSandboxEntry = z.infer<typeof adminSandboxEntrySchema>
export type AdminSandboxResponse = z.infer<typeof adminSandboxResponseSchema>
export type SandboxSettings = z.infer<typeof sandboxSettingsSchema>
export type MySandboxesResponse = z.infer<typeof mySandboxesResponseSchema>
export type PublicSandboxesResponse = z.infer<typeof publicSandboxesResponseSchema>
