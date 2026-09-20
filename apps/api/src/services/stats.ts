import type { StatsChannel, UsageStatsResponse } from "@kaja/schema/api"
import type { Pool } from "pg"

const MAX_TOOLS = 50

// Sessions active in the range.
const ACTIVE = "s.user_id = $1 AND s.updated_at >= $2"

/** Activity numbers for one user, straight from their saved sessions — nothing extra is recorded. */
export class StatsService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** The user's activity over the last `days` calendar days in `timeZone` (today included). Only ever reads this user's rows. */
  async usage(userId: string, days: number, timeZone = "UTC"): Promise<UsageStatsResponse> {
    // Midnight, in the viewer's zone, of the first day: a wall-clock day count keeps DST days whole.
    const { rows } = await this.#db.query(
      "SELECT (date_trunc('day', now() AT TIME ZONE $1) - ($2::int - 1) * interval '1 day') AT TIME ZONE $1 AS since",
      [timeZone, days]
    )
    const since: Date = rows[0].since
    const args = [userId, since]

    const [perDay, totals, channels, calls, approvals, personas, models] = await Promise.all([
      this.#db.query(
        `
        WITH days AS (
          SELECT generate_series(($2::timestamptz AT TIME ZONE $4)::date, ($2::timestamptz AT TIME ZONE $4)::date + ($3::int - 1), interval '1 day')::date AS day
        ),
        started AS (
          SELECT (created_at AT TIME ZONE $4)::date AS day, COUNT(*) AS n FROM nasi_session WHERE user_id = $1 AND created_at >= $2 GROUP BY 1
        ),
        active AS (
          SELECT (updated_at AT TIME ZONE $4)::date AS day, COUNT(*) AS n FROM nasi_session WHERE user_id = $1 AND updated_at >= $2 GROUP BY 1
        )
        SELECT to_char(days.day, 'YYYY-MM-DD') AS date, coalesce(started.n, 0)::int AS started, coalesce(active.n, 0)::int AS active
        FROM days LEFT JOIN started USING (day) LEFT JOIN active USING (day)
        ORDER BY days.day
        `,
        [...args, days, timeZone]
      ),
      this.#db.query(
        `
        SELECT (SELECT COUNT(*) FROM nasi_session s WHERE ${ACTIVE})::int AS sessions,
          COUNT(*) FILTER (WHERE m.role = 'user')::int AS messages,
          COALESCE(SUM(m.prompt_tokens), 0)::float8 AS prompt_tokens,
          COALESCE(SUM(m.completion_tokens), 0)::float8 AS completion_tokens,
          ROUND(AVG(m.latency_ms))::int AS avg_latency_ms
        FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
        WHERE ${ACTIVE}
        `,
        args
      ),
      this.#db.query(
        `SELECT s.channel, COUNT(*)::int AS sessions FROM nasi_session s WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC, 1`,
        args
      ),
      this.#db.query(
        `
        SELECT tc.name, COUNT(*)::int AS calls, COUNT(*) FILTER (WHERE tc.status = 'error')::int AS errors,
          ROUND(AVG(tc.duration_ms))::int AS avg_duration_ms
        FROM nasi_tool_call tc
        JOIN nasi_message m ON m.id = tc.message_id
        JOIN nasi_session s ON s.id = m.session_id
        WHERE ${ACTIVE}
        GROUP BY 1
        `,
        args
      ),
      this.#db.query(
        `
        SELECT tc.name, COUNT(*) FILTER (WHERE tc.approval = 'approved')::int AS approved, COUNT(*) FILTER (WHERE tc.approval = 'declined')::int AS declined
        FROM nasi_tool_call tc
        JOIN nasi_message m ON m.id = tc.message_id
        JOIN nasi_session s ON s.id = m.session_id
        WHERE ${ACTIVE} AND tc.approval IS NOT NULL
        GROUP BY 1
        `,
        args
      ),
      this.#db.query(
        `
        SELECT COALESCE(m.persona, 'default') AS persona, COUNT(*)::int AS replies, COUNT(DISTINCT m.session_id)::int AS sessions
        FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
        WHERE ${ACTIVE} AND m.role = 'assistant' AND m.model IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC, 1
        `,
        args
      ),
      this.#db.query(
        `
        SELECT m.model, COUNT(*)::int AS replies, COUNT(DISTINCT m.session_id)::int AS sessions,
          COALESCE(SUM(m.prompt_tokens), 0)::float8 AS prompt_tokens, COALESCE(SUM(m.completion_tokens), 0)::float8 AS completion_tokens
        FROM nasi_message m JOIN nasi_session s ON s.id = m.session_id
        WHERE ${ACTIVE} AND m.role = 'assistant' AND m.model IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC, 1
        `,
        args
      )
    ])

    const tools = new Map<UsageStatsResponse["tools"][number]["name"], UsageStatsResponse["tools"][number]>()
    const tool = (name: string) => {
      const entry = tools.get(name) ?? { name, calls: 0, approved: 0, declined: 0, errors: 0, avgDurationMs: null }
      tools.set(name, entry)
      return entry
    }
    for (const row of calls.rows) {
      const entry = tool(row.name)
      entry.calls = row.calls
      entry.errors = row.errors
      entry.avgDurationMs = row.avg_duration_ms
    }
    for (const row of approvals.rows) {
      const entry = tool(row.name)
      entry.approved = row.approved
      entry.declined = row.declined
    }
    const ranked = [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))

    return {
      days,
      timeZone,
      totals: {
        sessions: totals.rows[0]?.sessions ?? 0,
        messages: totals.rows[0]?.messages ?? 0,
        toolCalls: ranked.reduce((sum, entry) => sum + entry.calls, 0),
        promptTokens: totals.rows[0]?.prompt_tokens ?? 0,
        completionTokens: totals.rows[0]?.completion_tokens ?? 0,
        avgLatencyMs: totals.rows[0]?.avg_latency_ms ?? null
      },
      perDay: perDay.rows,
      channels: channels.rows.map(row => ({ channel: row.channel as StatsChannel, sessions: row.sessions })),
      tools: ranked.slice(0, MAX_TOOLS),
      personas: personas.rows,
      models: models.rows.map(row => ({
        model: row.model,
        replies: row.replies,
        sessions: row.sessions,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens
      }))
    }
  }
}
