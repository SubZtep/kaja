import { afterAll, expect, test } from "bun:test"
import { SQL } from "bun"
import { iso, jsonParam, pgText, readBool, readJson } from "../../src/store/sql-codec"

// What the codecs rely on from Bun.SQL's SQLite adapter; apps/api/tests/integration/sql-dialect.test.ts is the Postgres half
const sql = new SQL({ adapter: "sqlite", filename: ":memory:", strict: true })
afterAll(() => sql.close())

await sql`PRAGMA foreign_keys = ON`
await sql`CREATE TABLE parent (id text PRIMARY KEY, doc text, flag integer, at text, note text)`
await sql`CREATE TABLE child (id text PRIMARY KEY, parent_id text NOT NULL REFERENCES parent (id) ON DELETE CASCADE)`

const id = Bun.randomUUIDv7()

test("JSON, booleans, ISO timestamps and uuid-shaped ids round-trip through the codecs", async () => {
  const at = new Date("2026-10-23T12:00:00.000Z")
  await sql`
    INSERT INTO parent (id, doc, flag, at, note)
    VALUES (${id}, ${jsonParam(sql, { tags: ["a"], nul: "x\0y" })}, ${true}, ${at.toISOString()}, ${pgText("a\0b")})`
  const [row] = await sql`SELECT * FROM parent WHERE id = ${id}`
  expect(row.id).toBe(id)
  expect(typeof row.doc).toBe("string")
  expect(readJson(row.doc)).toEqual({ tags: ["a"], nul: "xy" })
  expect(row.flag).toBe(1)
  expect(readBool(row.flag)).toBe(true)
  expect(readBool(0)).toBe(false)
  expect(iso(row.at)).toBe(at.toISOString())
  expect(row.note).toBe("ab")
})

test("a null JSON parameter is SQL NULL, not JSON null", async () => {
  const [row] = await sql`SELECT ${jsonParam(sql, null)} AS bare, ${sql.json(null)} AS json`
  expect(row.bare).toBeNull()
  expect(row.json).toBe("null")
})

test("a Date parameter is refused, so shared SQL passes ISO text", async () => {
  await expect(sql`SELECT ${new Date()} AS at`.then(() => "ok")).rejects.toThrow()
})

test("ON CONFLICT DO UPDATE with COALESCE fills only what's empty, DO NOTHING keeps the row", async () => {
  await sql`INSERT INTO parent (id, note) VALUES (${"c1"}, ${null})`
  const upsert = (note: string) =>
    sql`INSERT INTO parent (id, note) VALUES (${"c1"}, ${note})
        ON CONFLICT (id) DO UPDATE SET note = COALESCE(parent.note, excluded.note)`
  await upsert("first")
  await upsert("second")
  const ignored = await sql`INSERT INTO parent (id, note) VALUES (${"c1"}, ${"third"}) ON CONFLICT (id) DO NOTHING`
  expect(ignored.affectedRows).toBe(0)
  const [row] = await sql`SELECT note FROM parent WHERE id = ${"c1"}`
  expect(row.note).toBe("first")
})

test("COUNT(*) is a number, and affectedRows counts what a write touched", async () => {
  const [{ n }] = await sql`SELECT COUNT(*) AS n FROM parent`
  expect(n).toBe(2)
  expect((await sql`UPDATE parent SET flag = ${false} WHERE id = ${id}`).affectedRows).toBe(1)
  expect((await sql`UPDATE parent SET flag = ${false} WHERE id = ${"missing"}`).affectedRows).toBe(0)
})

test("PRAGMA foreign_keys = ON makes a child without its parent fail", async () => {
  await expect(sql`INSERT INTO child (id, parent_id) VALUES (${"k"}, ${"missing"})`.then(() => "ok")).rejects.toThrow(
    "FOREIGN KEY"
  )
})

test("a nested fragment keeps its own bound values", async () => {
  const where = sql`id = ${id}`
  expect(await sql`SELECT id FROM parent WHERE ${where}`).toEqual([{ id }])
})

test("a second sql.begin waits for the first, so a failed transaction can't take another write with it", async () => {
  let second: Promise<unknown> | undefined
  const first = sql.begin(async tx => {
    await tx`INSERT INTO parent (id) VALUES (${"t1"})`
    second = sql.begin(tx2 => tx2`INSERT INTO parent (id) VALUES (${"t2"})`)
    await Bun.sleep(5)
    throw new Error("rolled back")
  })
  await expect(first).rejects.toThrow("rolled back")
  await second
  const rows = await sql<{ id: string }[]>`SELECT id FROM parent WHERE id IN (${"t1"}, ${"t2"})`
  expect(rows.map(row => row.id)).toEqual(["t2"])
})
