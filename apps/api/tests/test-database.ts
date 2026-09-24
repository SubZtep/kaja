import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Client } from "pg"

const migrationsDir = join(import.meta.dir, "..", "migrations")
// Any number works; it only has to be the same for every `bun test` that might race to build the database.
const BUILD_LOCK = 7_261_947

/** The migrations as one fingerprint: they're edited in place until v1.0, so a changed file means a rebuilt test database. */
function migrationsFingerprint(): { files: { name: string; sql: string }[]; hash: string } {
  const files = readdirSync(migrationsDir)
    .filter(name => name.endsWith(".sql"))
    .sort()
    .map(name => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") }))
  const hash = createHash("sha256")
  for (const file of files) hash.update(file.name).update("\0").update(file.sql).update("\0")
  return { files, hash: hash.digest("hex") }
}

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

async function builtHash(url: string): Promise<string | undefined> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const result = await client.query("SELECT hash FROM test_schema LIMIT 1").catch(() => undefined)
    return result?.rows[0]?.hash
  } finally {
    await client.end()
  }
}

/**
 * Points the tests at their own database, `<dev database>_test` beside the dev one (or TEST_DATABASE_URL),
 * so a running `bun dev` — its marketplace sync on every (hot) start, its cron — can't change rows a test
 * relies on. The database is (re)built from the migrations whenever they differ from what it was built from.
 * Postgres being down only warns: the API tests then fail on their own, and the CLI tests don't need it.
 */
export async function useTestDatabase(): Promise<void> {
  const devUrl = Bun.env.DATABASE_URL
  if (!devUrl) return
  const testUrl = Bun.env.TEST_DATABASE_URL || withDatabase(devUrl, `${new URL(devUrl).pathname.slice(1)}_test`)
  const testName = new URL(testUrl).pathname.slice(1)
  Bun.env.DATABASE_URL = testUrl

  const admin = new Client({ connectionString: withDatabase(testUrl, "postgres"), connectionTimeoutMillis: 3000 })
  try {
    await admin.connect()
  } catch (error) {
    console.warn(`Test database: Postgres unreachable, API tests will fail (${(error as Error).message})`)
    return
  }
  try {
    await admin.query("SELECT pg_advisory_lock($1)", [BUILD_LOCK])
    const { files, hash } = migrationsFingerprint()
    const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testName])).rowCount! > 0
    if (exists && (await builtHash(testUrl)) === hash) return

    const quoted = `"${testName.replaceAll('"', '""')}"`
    if (exists) await admin.query(`DROP DATABASE ${quoted} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${quoted}`)
    const client = new Client({ connectionString: testUrl })
    await client.connect()
    try {
      for (const file of files) await client.query(file.sql)
      await client.query("CREATE TABLE test_schema (hash TEXT NOT NULL)")
      await client.query("INSERT INTO test_schema (hash) VALUES ($1)", [hash])
    } finally {
      await client.end()
    }
    console.log(`Test database ${testName} built from ${files.length} migrations`)
  } finally {
    await admin.query("SELECT pg_advisory_unlock($1)", [BUILD_LOCK]).catch(() => {})
    await admin.end()
  }
}
