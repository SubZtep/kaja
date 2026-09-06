import { error } from "@kaja/logger"
import { Pool } from "pg"
import { env } from "./env"

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
  error("Database error", { error: err })
})

export const db = {
  query: async (text: string, params: unknown[]) => pool.query(text, params)
}
