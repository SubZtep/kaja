import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "pg"

// source tree: scripts/migrate.ts next to ../migrations
// built image: migrate.js next to ./migrations (see Dockerfile)
const scriptDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = existsSync(join(scriptDir, "migrations"))
  ? join(scriptDir, "migrations")
  : join(scriptDir, "..", "migrations")

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

await client.end()
console.log(`${files.length} migration${files.length === 1 ? "" : "s"} applied`)
