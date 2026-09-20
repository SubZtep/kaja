import { Pool } from "pg"
import { env } from "./env"
import { reportError } from "./report"

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  maxLifetimeSeconds: 60,
  allowExitOnIdle: true,
  onConnect: async client => {
    await client.query("SET TIME ZONE 'UTC'")
  }
})

pool.on("error", err => {
  reportError("Database error", err)
})
