import { Pool } from "pg"
import { env } from "./env"
import { reportError } from "./report"

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  maxLifetimeSeconds: 30 * 60,
  allowExitOnIdle: true,
  // Set at connection startup, no extra round trip: UTC timestamps, and no query may hold a connection past 15 s
  options: "-c TimeZone=UTC -c statement_timeout=15000"
})

pool.on("error", err => {
  reportError("Database error", err)
})
