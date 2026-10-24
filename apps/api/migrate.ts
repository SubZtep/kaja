import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { SQL } from "bun"
import { applyMigrations, readMigrations } from "./scripts/migrations"

// source tree and built image both keep migrate next to migrations (see Dockerfile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(scriptDir, "migrations")

const migrations = readMigrations(migrationsDir)

// Its own client, without the app's 15 s statement timeout: one file is one transaction, however long it takes
const db = new SQL({ url: process.env.DATABASE_URL, max: 1 })

const applied = await applyMigrations(db, migrations)
console.log(`migrations: ${applied} applied, ${migrations.length - applied} already up to date`)

await db.close()
