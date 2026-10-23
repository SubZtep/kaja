import { SQL } from "bun"
import { Pool } from "pg"
import { env } from "./env"
import { reportError } from "./report"

/**
 * The app's queries (tagged templates). Built from `env.DATABASE_URL`, not Bun's default client: the test preload
 * swaps the URL to the test database before this module loads.
 */
export const sql = new SQL({
  url: env.DATABASE_URL,
  max: 10,
  idleTimeout: 30,
  maxLifetime: 30 * 60,
  connectionTimeout: 2,
  // Startup parameters, like the pool's options below: UTC timestamps, and no query may hold a connection past 15 s
  connection: { application_name: "kaja-api", TimeZone: "UTC", statement_timeout: "15000" }
})

/** Better Auth's driver (`betterAuth({ database: pool })`), and the services not yet moved to `sql`. */
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
