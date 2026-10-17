import { Client } from "pg"
import type { Stack } from "./stack"

/** A read-only look into the stack's database, for what only the database knows (how many sessions a user has, say). */
export async function queryDb<T extends Record<string, unknown>>(
  stack: Stack,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = new Client({ connectionString: stack.databaseUrl })
  await client.connect()
  try {
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.end()
  }
}

/** How many cloud sessions `email` has on a channel. */
export async function sessionCount(
  stack: Stack,
  email: string,
  channel: "web" | "telegram" | "widget"
): Promise<number> {
  const rows = await queryDb<{ n: string }>(
    stack,
    `SELECT count(*) AS n FROM nasi_session s JOIN "user" u ON u.id = s.user_id WHERE u.email = $1 AND s.channel = $2`,
    [email, channel]
  )
  return Number(rows[0]?.n ?? 0)
}
