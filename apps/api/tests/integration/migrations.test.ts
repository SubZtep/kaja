import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { Client } from "pg"
import { applyMigrations, type Migration } from "../../scripts/migrations"

const migration = (name: string, sql: string): Migration => ({
  name,
  sql,
  checksum: createHash("sha256").update(sql).digest("hex")
})
const quiet = { log: () => {} }

describe("applyMigrations", () => {
  // Its own schema in the test database, so the runner creates a schema_migrations of its own
  const schema = "migrations_test"
  const client = new Client({ connectionString: Bun.env.DATABASE_URL })
  const tables = async () =>
    (
      await client.query<{ name: string }>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1",
        [schema]
      )
    ).rows.map(row => row.name)
  const recorded = async () =>
    (await client.query<{ filename: string }>("SELECT filename FROM schema_migrations ORDER BY 1")).rows.map(
      row => row.filename
    )

  beforeAll(async () => {
    await client.connect()
    await client.query("DROP SCHEMA IF EXISTS migrations_test CASCADE")
    await client.query("CREATE SCHEMA migrations_test")
    await client.query("SET search_path TO migrations_test")
  })

  afterAll(async () => {
    await client.query("DROP SCHEMA migrations_test CASCADE")
    await client.end()
  })

  test("applies new files once, in order, and records them", async () => {
    const files = [migration("1.sql", "CREATE TABLE a (id int)"), migration("2.sql", "CREATE TABLE b (id int)")]
    expect(await applyMigrations(client, files, quiet)).toBe(2)
    expect(await applyMigrations(client, files, quiet)).toBe(0)
    expect(await tables()).toEqual(["a", "b", "schema_migrations"])
    expect(await recorded()).toEqual(["1.sql", "2.sql"])
  })

  test("before v1.0 an edited file is applied again; after, it's refused", async () => {
    const edited = [migration("1.sql", "CREATE TABLE IF NOT EXISTS a (id int); CREATE TABLE IF NOT EXISTS c (id int)")]
    await expect(applyMigrations(client, edited, { ...quiet, allowEdits: false })).rejects.toThrow(
      "1.sql changed after it was applied"
    )
    expect(await applyMigrations(client, edited, { ...quiet, allowEdits: true })).toBe(1)
    expect(await tables()).toContain("c")
    expect(await applyMigrations(client, edited, { ...quiet, allowEdits: false })).toBe(0)
  })

  test("a failing file leaves nothing of itself behind", async () => {
    const broken = [migration("3.sql", "CREATE TABLE d (id int); SELECT no_such_column FROM d")]
    await expect(applyMigrations(client, broken, quiet)).rejects.toThrow("3.sql failed, nothing of it was applied")
    expect(await tables()).not.toContain("d")
    expect(await recorded()).not.toContain("3.sql")
  })
})
