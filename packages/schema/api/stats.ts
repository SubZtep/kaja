import { z } from "zod"

/** How far back the stats look, in days, today included. */
export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
})

/** Where a session was started: the web app or CLI (`web`), the Telegram bot, or a widget visitor's chat. */
export const statsChannelSchema = z.enum(["web", "telegram", "widget"])

/** The signed-in user's activity over the last `days` days. Sessions are counted when last active in that range, and days are UTC. */
export const usageStatsResponseSchema = z.object({
  days: z.number().int(),
  totals: z.object({ sessions: z.number().int(), messages: z.number().int(), toolCalls: z.number().int() }),
  /** One entry per day, oldest first, zeros included: sessions started that day, and sessions last active that day. */
  perDay: z.array(z.object({ date: z.string(), started: z.number().int(), active: z.number().int() })),
  channels: z.array(z.object({ channel: statsChannelSchema, sessions: z.number().int() })),
  /** Most used first. `approved` and `declined` count the calls that asked for approval. */
  tools: z.array(
    z.object({ name: z.string(), calls: z.number().int(), approved: z.number().int(), declined: z.number().int() })
  ),
  personas: z.array(z.object({ persona: z.string(), sessions: z.number().int() })),
  models: z.array(z.object({ model: z.string(), sessions: z.number().int() }))
})

export type StatsQuery = z.infer<typeof statsQuerySchema>
export type StatsChannel = z.infer<typeof statsChannelSchema>
export type UsageStatsResponse = z.infer<typeof usageStatsResponseSchema>
