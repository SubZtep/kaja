import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "pg"
import { seedConfig } from "./scripts/seed-config"

// source tree and built image both keep migrate next to migrations (see Dockerfile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(scriptDir, "migrations")

const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith(".sql"))
  .sort()

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

for (const file of files) {
  console.log(`applying ${file}`)
  const sql = readFileSync(join(migrationsDir, file), "utf8")
  await client.query(sql)
}

console.log(`${files.length} migration${files.length === 1 ? "" : "s"} applied`)

// The cloud agent reads its persona catalog from the DB, so an unseeded database means no
// personas at all. Idempotent, so running it on every deploy leaves admin edits untouched.
await seedConfig(client)

await client.end()
