import type { SQL } from "bun"

/** A timestamp as ISO text: Postgres reads `timestamptz` as a `Date`, SQLite keeps the text it was given. */
export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}

/** A JSON column's value: an object from Postgres `jsonb`, text from SQLite. */
export function readJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T
}

/** A boolean column's value: `true`/`false` from Postgres, `1`/`0` from SQLite. */
export const readBool = (value: unknown): boolean => Boolean(value)

/** Text without NUL bytes, which Postgres `text` rejects (a tool that returned binary data would fail the save). */
export const pgText = (text: string | null | undefined): string | null => text?.replaceAll("\0", "") ?? null

function stripNul(value: unknown): unknown {
  if (typeof value === "string") return value.replaceAll("\0", "")
  if (Array.isArray(value)) return value.map(stripNul)
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, stripNul(inner)]))
  return value
}

/** A JSON parameter on both engines; null stays SQL `NULL` (`sql.json(null)` would store JSON null). */
export function jsonParam(sql: SQL, value: unknown) {
  return value === null || value === undefined ? null : sql.json(stripNul(value))
}
