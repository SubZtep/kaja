import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "pg"
import { applyMigrations, readMigrations } from "./scripts/migrations"
import { seedConfig } from "./scripts/seed-config"

// source tree and built image both keep migrate next to migrations (see Dockerfile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(scriptDir, "migrations")

const migrations = readMigrations(migrationsDir)

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const applied = await applyMigrations(client, migrations)
console.log(`migrations: ${applied} applied, ${migrations.length - applied} already up to date`)

// The cloud agent reads its persona catalog from the DB, so an unseeded database means no
// personas at all. Idempotent, so running it on every deploy leaves admin edits untouched.
await seedConfig(client)

await client.end()
