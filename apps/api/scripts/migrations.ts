import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ClientBase } from "pg"
import pkg from "../package.json" with { type: "json" }

/** Any number works; it only has to be the same for every run, so two deploys never apply migrations at once. */
const MIGRATION_LOCK = 7_261_948

export type Migration = { name: string; sql: string; checksum: string }

/** The `.sql` files in `dir`, in the (lexicographic) order they apply in. */
export function readMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter(name => name.endsWith(".sql"))
    .sort()
    .map(name => {
      const sql = readFileSync(join(dir, name), "utf8")
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") }
    })
}

/**
 * Applies the migrations the database hasn't run, each in its own transaction, and records them in `schema_migrations`.
 * Until v1.0 migrations are edited in place (and written to be re-runnable), so by default an edited file is applied
 * again; from v1.0 an edit is refused, and a schema change needs a new file. Returns how many files it applied.
 */
export async function applyMigrations(
  client: ClientBase,
  migrations: Migration[],
  {
    allowEdits = pkg.version.startsWith("0."),
    log = console.log
  }: { allowEdits?: boolean; log?: (line: string) => void } = {}
): Promise<number> {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK])
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"
    )
    const { rows } = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM schema_migrations"
    )
    const applied = new Map(rows.map(row => [row.filename, row.checksum]))

    let count = 0
    for (const migration of migrations) {
      const known = applied.get(migration.name)
      if (known === migration.checksum) continue
      if (known && !allowEdits) {
        throw new Error(`${migration.name} changed after it was applied; put the change in a new migration`)
      }
      log(`${known ? "re-applying edited" : "applying"} ${migration.name}`)
      await client.query("BEGIN")
      try {
        await client.query(migration.sql)
        await client.query(
          `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
           ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
          [migration.name, migration.checksum]
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw new Error(`${migration.name} failed, nothing of it was applied`, { cause: error })
      }
      count++
    }
    return count
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK])
  }
}
