import * as z from "zod"

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
  session: z.looseObject({
    messages: z.array(z.unknown()),
    pendingAskUserId: z.string().optional(),
    pendingRunCommandId: z.string().optional()
  }),
  events: z.array(z.looseObject({ type: z.string() }))
})

/** List-view projection: everything but the two payload blobs. */
export const SessionMetaSchema = PersistedSessionSchema.omit({
  session: true,
  events: true
})

export type PersistedSession = z.infer<typeof PersistedSessionSchema>
export type SessionMeta = z.infer<typeof SessionMetaSchema>

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
