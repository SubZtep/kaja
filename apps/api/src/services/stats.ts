import type { ImageStats, StatsChannel, UsageStatsResponse } from "@kaja/schema/api"
import type { SQL } from "bun"
import { sourceHost } from "./image"

const MAX_TOOLS = 50
const MAX_IMAGE_SITES = 5
const MAX_IMAGE_SESSIONS = 5

/** Activity numbers for one user, straight from their saved sessions — nothing extra is recorded. */
export class StatsService {
  readonly #db: SQL

  constructor(db: SQL) {
    this.#db = db
  }

  /**
   * The user's activity over the last `days` calendar days in `timeZone` (today included). Only ever reads this user's
   * rows.
   */
  async usage(userId: string, days: number, timeZone = "UTC"): Promise<UsageStatsResponse> {
    const since = await this.#rangeStart(days, timeZone)
    const db = this.#db
    // Sessions active in the range
    const active = db`s.user_id = ${userId} AND s.updated_at >= ${since}`

    const [perDay, totals, channels, calls, approvals, widgetSpend, personas, models, images] = await Promise.all([
      db<UsageStatsResponse["perDay"]>`
        WITH days AS (
          SELECT generate_series((${since}::timestamptz AT TIME ZONE ${timeZone})::date,
            (${since}::timestamptz AT TIME ZONE ${timeZone})::date + (${days}::int - 1), interval '1 day')::date AS day
        ),
        started AS (
          SELECT (created_at AT TIME ZONE ${timeZone})::date AS day, COUNT(*) AS n FROM nasi_session
          WHERE user_id = ${userId} AND created_at >= ${since} GROUP BY 1
        ),
        active AS (
          SELECT (updated_at AT TIME ZONE ${timeZone})::date AS day, COUNT(*) AS n FROM nasi_session
          WHERE user_id = ${userId} AND updated_at >= ${since} GROUP BY 1
        )
        SELECT to_char(days.day, 'YYYY-MM-DD') AS date, coalesce(started.n, 0)::int AS started, coalesce(active.n, 0)::int AS active
        FROM days LEFT JOIN started USING (day) LEFT JOIN active USING (day)
        ORDER BY days.day`,
      db`
        WITH summaries AS (
          SELECT COALESCE(SUM(c.prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(c.completion_tokens), 0) AS completion_tokens
          FROM nasi_model_call c JOIN nasi_session s ON s.id = c.session_id
          WHERE ${active}
        )
        SELECT (SELECT COUNT(*) FROM nasi_session s WHERE ${active})::int AS sessions,
          COUNT(*) FILTER (WHERE m.role = 'user')::int AS messages,
          (COALESCE(SUM(m.prompt_tokens), 0) + (SELECT prompt_tokens FROM summaries))::float8 AS prompt_tokens,
          (COALESCE(SUM(m.completion_tokens), 0) + (SELECT completion_tokens FROM summaries))::float8 AS completion_tokens,
          ROUND(AVG(m.latency_ms))::int AS avg_latency_ms
        FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
        WHERE ${active}
        `,
      db<
        { channel: string; sessions: number }[]
      >`SELECT s.channel, COUNT(*)::int AS sessions FROM nasi_session s WHERE ${active} GROUP BY 1 ORDER BY 2 DESC, 1`,
      db`
        SELECT tc.name, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE tc.status = 'error')::int AS errors,
          ROUND(AVG(tc.duration_ms))::int AS avg_duration_ms
        FROM nasi_tool_call tc
        JOIN nasi_message m ON m.id = tc.message_id
        JOIN nasi_session s ON s.id = m.session_id
        WHERE ${active}
        GROUP BY 1
        `,
      db`
        SELECT tc.name, COUNT(*) FILTER (WHERE tc.approval = 'approved')::int AS approved, COUNT(*) FILTER (WHERE tc.approval = 'declined')::int AS declined
        FROM nasi_tool_call tc
        JOIN nasi_message m ON m.id = tc.message_id
        JOIN nasi_session s ON s.id = m.session_id
        WHERE ${active} AND tc.approval IS NOT NULL
        GROUP BY 1
        `,
      db<{ prompt_tokens: number; completion_tokens: number }[]>`
        SELECT COALESCE(SUM(c.prompt_tokens), 0)::float8 AS prompt_tokens,
          COALESCE(SUM(c.completion_tokens), 0)::float8 AS completion_tokens
        FROM widget_call c JOIN widget w ON w.id = c.widget_id
        WHERE w.user_id = ${userId} AND c.created_at >= ${since}`,
      db`
        SELECT COALESCE(m.persona, 'default') AS persona, COUNT(*)::int AS replies, COUNT(DISTINCT m.session_id)::int AS sessions
        FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
        WHERE ${active} AND m.role = 'assistant' AND m.model IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC, 1
        `,
      db<
        {
          model: string
          replies: number
          summaries: number
          sessions: number
          prompt_tokens: number
          completion_tokens: number
        }[]
      >`
        WITH used AS (
          SELECT m.session_id, m.model, 1 AS reply, 0 AS summary, m.prompt_tokens, m.completion_tokens
          FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
          WHERE ${active} AND m.role = 'assistant' AND m.model IS NOT NULL
          UNION ALL
          SELECT c.session_id, c.model, 0, 1, c.prompt_tokens, c.completion_tokens
          FROM nasi_model_call c JOIN nasi_session s ON s.id = c.session_id
          WHERE ${active}
        )
        SELECT model, SUM(reply)::int AS replies, SUM(summary)::int AS summaries, COUNT(DISTINCT session_id)::int AS sessions,
          COALESCE(SUM(prompt_tokens), 0)::float8 AS prompt_tokens, COALESCE(SUM(completion_tokens), 0)::float8 AS completion_tokens
        FROM used
        GROUP BY 1 ORDER BY SUM(reply) + SUM(summary) DESC, 1
        `,
      this.#imagesSince(userId, since)
    ])

    const tools = new Map<UsageStatsResponse["tools"][number]["name"], UsageStatsResponse["tools"][number]>()
    const tool = (name: string) => {
      const entry = tools.get(name) ?? { name, calls: 0, approved: 0, declined: 0, errors: 0, avgDurationMs: null }
      tools.set(name, entry)
      return entry
    }
    for (const row of calls) {
      const entry = tool(row.name)
      entry.calls = row.calls
      entry.errors = row.errors
      entry.avgDurationMs = row.avg_duration_ms
    }
    for (const row of approvals) {
      const entry = tool(row.name)
      entry.approved = row.approved
      entry.declined = row.declined
    }
    const ranked = [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))

    return {
      days,
      timeZone,
      totals: {
        sessions: totals[0]?.sessions ?? 0,
        messages: totals[0]?.messages ?? 0,
        toolCalls: ranked.reduce((sum, entry) => sum + entry.calls, 0),
        promptTokens: (totals[0]?.prompt_tokens ?? 0) + (widgetSpend[0]?.prompt_tokens ?? 0),
        completionTokens: (totals[0]?.completion_tokens ?? 0) + (widgetSpend[0]?.completion_tokens ?? 0),
        avgLatencyMs: totals[0]?.avg_latency_ms ?? null
      },
      perDay: [...perDay],
      channels: channels.map(row => ({ channel: row.channel as StatsChannel, sessions: row.sessions })),
      tools: ranked.slice(0, MAX_TOOLS),
      personas: [...personas],
      models: models.map(row => ({
        model: row.model,
        replies: row.replies,
        summaries: row.summaries,
        sessions: row.sessions,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens
      })),
      images
    }
  }

  /** The user's stored images, with what arrived over the last `days` calendar days in `timeZone` (today included). */
  async images(userId: string, days: number, timeZone = "UTC"): Promise<ImageStats> {
    return this.#imagesSince(userId, await this.#rangeStart(days, timeZone))
  }

  // Midnight, in the viewer's zone, of the first day: a wall-clock day count keeps DST days whole.
  async #rangeStart(days: number, timeZone: string): Promise<Date> {
    const [row] = await this.#db<{ since: Date }[]>`
      SELECT (date_trunc('day', now() AT TIME ZONE ${timeZone}) - (${days}::int - 1) * interval '1 day')
        AT TIME ZONE ${timeZone} AS since`
    return row!.since
  }

  // What's kept now, what arrived since `since`, where most came from and which chats hold the most.
  async #imagesSince(userId: string, since: Date): Promise<ImageStats> {
    const [totals, sites, sessions] = await Promise.all([
      this.#db<{ count: number; bytes: number; described: number; added: number; added_bytes: number }[]>`
        SELECT COUNT(*)::int AS count, COALESCE(SUM(bytes), 0)::float8 AS bytes,
          COUNT(description)::int AS described,
          COUNT(*) FILTER (WHERE created_at >= ${since})::int AS added,
          COALESCE(SUM(bytes) FILTER (WHERE created_at >= ${since}), 0)::float8 AS added_bytes
        FROM nasi_image WHERE user_id = ${userId}`,
      // A URL's host, without "www."; images from files or tools without a URL have none
      this.#db<ImageStats["sites"]>`
        SELECT host, COUNT(*)::int AS images FROM (
          SELECT ${sourceHost(this.#db, "source_url")} AS host
          FROM nasi_image WHERE user_id = ${userId} AND source_url IS NOT NULL
        ) hosts
        WHERE host IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${MAX_IMAGE_SITES}`,
      // Only saved sessions: a new session's images arrive before its first save
      this.#db<{ id: string; title: string; channel: string; images: number; bytes: number }[]>`
        SELECT s.id, s.title, s.channel, COUNT(*)::int AS images, SUM(i.bytes)::float8 AS bytes
        FROM nasi_image i JOIN nasi_session s ON s.id = i.session_id AND s.user_id = i.user_id
        WHERE i.user_id = ${userId}
        GROUP BY 1, 2, 3 ORDER BY 5 DESC, 1 LIMIT ${MAX_IMAGE_SESSIONS}`
    ])
    const row = totals[0]!
    return {
      count: row.count,
      bytes: row.bytes,
      described: row.described,
      undescribed: row.count - row.described,
      added: row.added,
      addedBytes: row.added_bytes,
      sites: [...sites],
      sessions: sessions.map(session => ({
        id: session.id,
        title: session.title,
        channel: session.channel as StatsChannel,
        images: session.images,
        bytes: session.bytes
      }))
    }
  }
}
