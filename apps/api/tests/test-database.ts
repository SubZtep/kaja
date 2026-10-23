import { createHash } from "node:crypto"
import { join } from "node:path"
import { SQL } from "bun"
import { applyMigrations, type Migration, readMigrations } from "../scripts/migrations"

const migrationsDir = join(import.meta.dir, "..", "migrations")
// Any number works; it only has to be the same for every `bun test` that might race to build the database.
const BUILD_LOCK = 7_261_947

/**
 * The migrations as one fingerprint: they're edited in place until v1.0, so a changed file means a rebuilt test
 * database.
 */
function migrationsFingerprint(): { files: Migration[]; hash: string } {
  const files = readMigrations(migrationsDir)
  const hash = createHash("sha256")
  for (const file of files) hash.update(file.name).update("\0").update(file.checksum).update("\0")
  return { files, hash: hash.digest("hex") }
}

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

async function builtHash(url: string): Promise<string | undefined> {
  const db = new SQL({ url, max: 1 })
  try {
    const rows = await db<{ hash: string }[]>`SELECT hash FROM test_schema LIMIT 1`.catch(() => [])
    return rows[0]?.hash
  } finally {
    await db.close()
  }
}

/**
 * Points the tests at their own database, `<dev database>_test` beside the dev one (or TEST_DATABASE_URL), so a running
 * `bun dev` — its marketplace sync on every (hot) start, its cron — can't change rows a test relies on. The database is
 * (re)built from the migrations whenever they differ from what it was built from. Postgres being down only warns: the
 * API tests then fail on their own, and the CLI tests don't need it.
 */
export async function switchToTestDatabase(): Promise<void> {
  const devUrl = Bun.env.DATABASE_URL
  if (!devUrl) return
  const testUrl = Bun.env.TEST_DATABASE_URL || withDatabase(devUrl, `${new URL(devUrl).pathname.slice(1)}_test`)
  const testName = new URL(testUrl).pathname.slice(1)
  Bun.env.DATABASE_URL = testUrl

  const admin = new SQL({ url: withDatabase(testUrl, "postgres"), max: 1, connectionTimeout: 3 })
  // The build lock is an advisory lock, so it and everything it guards share one connection
  let conn: Awaited<ReturnType<SQL["reserve"]>>
  try {
    conn = await admin.reserve()
  } catch (error) {
    console.warn(`Test database: Postgres unreachable, API tests will fail (${(error as Error).message})`)
    await admin.close()
    return
  }
  try {
    await conn`SELECT pg_advisory_lock(${BUILD_LOCK})`
    const { files, hash } = migrationsFingerprint()
    const exists = (await conn`SELECT 1 FROM pg_database WHERE datname = ${testName}`).length > 0
    if (exists && (await builtHash(testUrl)) === hash) return

    if (exists) await conn`DROP DATABASE ${conn(testName)} WITH (FORCE)`
    await conn`CREATE DATABASE ${conn(testName)}`
    const db = new SQL({ url: testUrl, max: 1 })
    try {
      await applyMigrations(db, files, { log: () => {} })
      await db`CREATE TABLE test_schema (hash TEXT NOT NULL)`
      await db`INSERT INTO test_schema (hash) VALUES (${hash})`
    } finally {
      await db.close()
    }
    console.log(`Test database ${testName} built from ${files.length} migrations`)
  } finally {
    await conn`SELECT pg_advisory_unlock(${BUILD_LOCK})`.catch(() => {})
    conn.release()
    await admin.close()
  }
}
