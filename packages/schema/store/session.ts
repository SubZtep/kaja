import * as z from "zod"

const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() })
const ImagePartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({ url: z.string(), detail: z.enum(["auto", "low", "high"]).optional() })
})
const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() })
})

/** One message of a stored conversation, in the OpenAI chat format the agent sends: only the shapes Kaja writes (text and image parts, function calls). */
export const SessionMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("system"), content: z.union([z.string(), z.array(TextPartSchema)]) }),
  z.object({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(z.discriminatedUnion("type", [TextPartSchema, ImagePartSchema]))])
  }),
  z.object({
    role: z.literal("assistant"),
    content: z
      .union([z.string(), z.array(TextPartSchema)])
      .nullable()
      .optional(),
    tool_calls: z.array(ToolCallSchema).optional(),
    /** The thinking some providers return beside the reply, sent back to them as it came. */
    reasoning_content: z.string().optional()
  }),
  z.object({
    role: z.literal("tool"),
    tool_call_id: z.string(),
    content: z.union([z.string(), z.array(TextPartSchema)])
  })
])

/** The replayable conversation a store keeps: what nasi's `Session` holds apart from its unsaved telemetry. */
export const StoredConversationSchema = z.object({
  messages: z.array(SessionMessageSchema),
  pendingAskUserId: z.string().optional(),
  pendingRunCommandId: z.string().optional(),
  pendingClientToolCallId: z.string().optional(),
  pendingToolApprovalId: z.string().optional(),
  grantedTools: z.array(z.string()).optional(),
  summary: z.object({ text: z.string(), from: z.int().nonnegative() }).optional(),
  toolSummaries: z.record(z.string(), z.string()).optional()
})

/** A persisted conversation: `session` is the replayable OpenAI-format history, `events` is the rendered timeline for exact resume repaint. */
export const PersistedSessionSchema = z.object({
  id: z.uuidv7(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Persona.id at last save. */
  persona: z.string(),
  /** Model id at last save. */
  model: z.string(),
  /** First user prompt's first line, at most 60 chars. */
  title: z.string(),
  // Owner: null = terminal (also legacy rows); telegram:<user id> = one Telegram user's sessions.
  owner: z.string().nullable().default(null),
  session: StoredConversationSchema,
  /** Empty when the store keeps no timeline (the cloud's Postgres store never reads one back). */
  events: z.array(z.looseObject({ type: z.string() }))
})

/** List-view projection: everything but the two payload blobs. */
export const SessionMetaSchema = PersistedSessionSchema.omit({
  session: true,
  events: true
})

export type PersistedSession = z.infer<typeof PersistedSessionSchema>
export type SessionMeta = z.infer<typeof SessionMetaSchema>
export type StoredConversation = z.infer<typeof StoredConversationSchema>

/** Owner value for terminal (local, single-user) sessions. */
export const LOCAL_OWNER = null

/** Owner string for a Telegram user's sessions — the `telegram:` prefix format lives only here. */
export function telegramOwner(userId: number): string {
  return `telegram:${userId}`
}

/** Owner string for one widget embed's visitor — namespaced by key id so two embeds (or a revoked key) never collide. */
export function widgetVisitorOwner(keyId: string, visitorId: string): string {
  return `widget:${keyId}:${visitorId}`
}

/** Where a session came from, by its owner's prefix (no owner is the web app or the terminal). */
export function channelOf(owner: string | null): "web" | "telegram" | "widget" {
  const prefix = owner?.split(":", 1)[0]
  return prefix === "telegram" || prefix === "widget" ? prefix : "web"
}
