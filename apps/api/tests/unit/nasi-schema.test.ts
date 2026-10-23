import { expect, test } from "bun:test"
import { SQLITE_SCHEMA } from "@kaja/nasi"

const NOT_COLUMNS = new Set(["PRIMARY", "UNIQUE", "CONSTRAINT", "FOREIGN", "CHECK"])

// Each table's column names; types, checks and foreign keys may differ between the engines
function columns(ddl: string): Record<string, string[]> {
  const tables: Record<string, string[]> = {}
  const stripped = ddl.replaceAll(/--.*$/gm, "")
  for (const [, name, body] of stripped.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    tables[name!] = body!
      .split("\n")
      .map(line => line.trim().split(/\s+/, 1)[0]!)
      .filter(word => word && !NOT_COLUMNS.has(word))
      .toSorted()
  }
  return tables
}

test("the SQLite schema has the Postgres nasi tables with the same columns", async () => {
  const postgres = columns(await Bun.file(new URL("../../migrations/2026-09-07-nasi.sql", import.meta.url)).text())
  const sqlite = columns(SQLITE_SCHEMA)
  expect(Object.keys(postgres)).toContain("nasi_session_event")
  expect(sqlite).toEqual(postgres)
})
