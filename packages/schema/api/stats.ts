import { z } from "zod"

/** How far back the stats look, in days, today included. */
export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
})

/** Where a session was started: the web app or CLI (`web`), the Telegram bot, or a widget visitor's chat. */
export const statsChannelSchema = z.enum(["web", "telegram", "widget"])

/** The signed-in user's activity over the last `days` days. Only sessions last active in that range count (all their messages), and days are UTC. Tokens, times and per-reply numbers only exist for replies saved since they were recorded. */
export const usageStatsResponseSchema = z.object({
  days: z.number().int(),
  totals: z.object({
    sessions: z.number().int(),
    messages: z.number().int(),
    toolCalls: z.number().int(),
    promptTokens: z.number().int(),
    completionTokens: z.number().int(),
    /** Average time a model round took, in ms; null until one was recorded. */
    avgLatencyMs: z.number().int().nullable()
  }),
  /** One entry per day, oldest first, zeros included: sessions started that day, and sessions last active that day. */
  perDay: z.array(z.object({ date: z.string(), started: z.number().int(), active: z.number().int() })),
  channels: z.array(z.object({ channel: statsChannelSchema, sessions: z.number().int() })),
  /** Most used first. `approved` and `declined` count the calls that asked for approval; `errors` the calls that failed; `avgDurationMs` is null when none was timed. */
  tools: z.array(
    z.object({
      name: z.string(),
      calls: z.number().int(),
      approved: z.number().int(),
      declined: z.number().int(),
      errors: z.number().int(),
      avgDurationMs: z.number().int().nullable()
    })
  ),
  /** Replies (assistant messages) per persona, most first, and the chats they were in. */
  personas: z.array(z.object({ persona: z.string(), replies: z.number().int(), sessions: z.number().int() })),
  /** Replies per model, most first, with the chats they were in and the tokens they used. */
  models: z.array(
    z.object({
      model: z.string(),
      replies: z.number().int(),
      sessions: z.number().int(),
      promptTokens: z.number().int(),
      completionTokens: z.number().int()
    })
  )
})

export type StatsQuery = z.infer<typeof statsQuerySchema>
export type StatsChannel = z.infer<typeof statsChannelSchema>
export type UsageStatsResponse = z.infer<typeof usageStatsResponseSchema>
