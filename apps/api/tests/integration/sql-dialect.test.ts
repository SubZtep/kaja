import { afterAll, beforeAll, expect, test } from "bun:test"
import { iso, jsonParam, pgText, readBool, readJson } from "@kaja/nasi"
import { sql } from "../../src/core/db"

// The Postgres half of packages/nasi/tests/store/sql-dialect.test.ts: what the shared store's codecs rely on here
const TABLE = "sql_dialect_probe"

beforeAll(async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS sql_dialect_probe (
      id uuid PRIMARY KEY, doc jsonb, flag boolean, at timestamptz, note text, list jsonb NOT NULL DEFAULT '[]'
    )`
})
afterAll(async () => {
  await sql`DROP TABLE IF EXISTS ${sql(TABLE)}`
})

test("jsonb reads as an object, uuid as a string, timestamptz as a Date, boolean as true/false", async () => {
  const id = Bun.randomUUIDv7()
  const at = new Date("2026-10-23T12:00:00.000Z")
  await sql`
    INSERT INTO sql_dialect_probe (id, doc, flag, at, note, list)
    VALUES (${id}, ${jsonParam(sql, { nul: "x\0y" })}, ${true}, ${at.toISOString()}, ${pgText("a\0b")},
            ${sql.json(["read"])})`
  const [row] = await sql`SELECT * FROM sql_dialect_probe WHERE id = ${id}`
  expect(row.id).toBe(id)
  expect(row.doc).toEqual({ nul: "xy" })
  expect(readJson(row.doc)).toEqual({ nul: "xy" })
  expect(row.list).toEqual(["read"])
  expect(row.flag).toBe(true)
  expect(readBool(row.flag)).toBe(true)
  expect(row.at).toBeInstanceOf(Date)
  expect(iso(row.at)).toBe(at.toISOString())
  expect(row.note).toBe("ab")
})

test("a NUL inside JSON is refused unless jsonParam strips it", async () => {
  const insert = (doc: unknown) => sql`INSERT INTO sql_dialect_probe (id, doc) VALUES (${Bun.randomUUIDv7()}, ${doc})`
  await expect(insert(sql.json({ nul: "x\0y" })).then(() => "ok")).rejects.toThrow("Unicode")
  await insert(jsonParam(sql, { nul: "x\0y" }))
  const [row] = await sql`SELECT ${jsonParam(sql, null)}::jsonb AS bare`
  expect(row.bare).toBeNull()
})

test("COUNT(*) is int8 text, so the store reads it through Number(); affectedRows counts matched rows", async () => {
  const [{ n }] = await sql`SELECT COUNT(*) AS n FROM sql_dialect_probe`
  expect(typeof n).toBe("string")
  expect(Number(n)).toBeGreaterThan(0)
  const id = Bun.randomUUIDv7()
  await sql`INSERT INTO sql_dialect_probe (id) VALUES (${id})`
  expect((await sql`UPDATE sql_dialect_probe SET flag = ${false} WHERE id = ${id}`).affectedRows).toBe(1)
  expect((await sql`UPDATE sql_dialect_probe SET flag = ${false} WHERE id = ${Bun.randomUUIDv7()}`).affectedRows).toBe(
    0
  )
  const again = await sql`INSERT INTO sql_dialect_probe (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`
  expect(again.affectedRows).toBe(0)
})

test("the client's startup parameters set UTC and the statement timeout", async () => {
  const [{ TimeZone }] = await sql`SHOW TimeZone`
  const [{ statement_timeout }] = await sql`SHOW statement_timeout`
  expect(TimeZone).toBe("UTC")
  expect(statement_timeout).toBe("15s")
})
