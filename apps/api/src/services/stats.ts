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

  /** The user's activity over the last `days` days (UTC, today included). Only ever reads this user's rows. */
  async usage(userId: string, days: number): Promise<UsageStatsResponse> {
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    since.setUTCDate(since.getUTCDate() - (days - 1))
    const args = [userId, since]

    const [perDay, totals, channels, calls, approvals, personas, models] = await Promise.all([
      this.#db.query(
        `
        WITH days AS (
          SELECT generate_series(($2::timestamptz AT TIME ZONE 'UTC')::date, ($2::timestamptz AT TIME ZONE 'UTC')::date + ($3::int - 1), interval '1 day')::date AS day
        ),
        started AS (
          SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS n FROM nasi_session WHERE user_id = $1 AND created_at >= $2 GROUP BY 1
        ),
        active AS (
          SELECT (updated_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS n FROM nasi_session WHERE user_id = $1 AND updated_at >= $2 GROUP BY 1
        )
        SELECT to_char(days.day, 'YYYY-MM-DD') AS date, coalesce(started.n, 0)::int AS started, coalesce(active.n, 0)::int AS active
        FROM days LEFT JOIN started USING (day) LEFT JOIN active USING (day)
        ORDER BY days.day
        `,
        [...args, days]
      ),
      this.#db.query(
        `
        SELECT COUNT(*)::int AS sessions,
          (SELECT COUNT(*) FROM nasi_message m JOIN nasi_session s2 ON s2.id = m.session_id
           WHERE m.role = 'user' AND s2.user_id = $1 AND s2.updated_at >= $2)::int AS messages
        FROM nasi_session s WHERE ${ACTIVE}
        `,
        args
      ),
      this.#db.query(
        `SELECT s.channel, COUNT(*)::int AS sessions FROM nasi_session s WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC, 1`,
        args
      ),
      this.#db.query(
        `
        SELECT tc.name, COUNT(*)::int AS calls
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
        `SELECT s.persona, COUNT(*)::int AS sessions FROM nasi_session s WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC, 1`,
        args
      ),
      this.#db.query(
        `SELECT s.model, COUNT(*)::int AS sessions FROM nasi_session s WHERE ${ACTIVE} GROUP BY 1 ORDER BY 2 DESC, 1`,
        args
      )
    ])

    const tools = new Map<string, { name: string; calls: number; approved: number; declined: number }>()
    const tool = (name: string) => {
      const entry = tools.get(name) ?? { name, calls: 0, approved: 0, declined: 0 }
      tools.set(name, entry)
      return entry
    }
    for (const row of calls.rows) tool(row.name).calls = row.calls
    for (const row of approvals.rows) {
      const entry = tool(row.name)
      entry.approved = row.approved
      entry.declined = row.declined
    }
    const ranked = [...tools.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))

    return {
      days,
      totals: {
        sessions: totals.rows[0]?.sessions ?? 0,
        messages: totals.rows[0]?.messages ?? 0,
        toolCalls: ranked.reduce((sum, entry) => sum + entry.calls, 0)
      },
      perDay: perDay.rows,
      channels: channels.rows.map(row => ({ channel: row.channel as StatsChannel, sessions: row.sessions })),
      tools: ranked.slice(0, MAX_TOOLS),
      personas: personas.rows,
      models: models.rows
    }
  }
}
