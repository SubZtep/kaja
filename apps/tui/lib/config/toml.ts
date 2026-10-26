import { file, TOML, write } from "bun"

/**
 * Adds a table to a TOML config file when it isn't there yet, by appending text rather than re-serializing: these files
 * are hand-edited and mostly commented-out examples, all of which a parse-and-stringify round trip would throw away.
 *
 * Returns false and changes nothing when the table is already present, so a section the user has configured themselves
 * is never overwritten.
 */
export async function appendTomlSection(path: string, table: string, lines: string[]): Promise<boolean> {
  const f = file(path)
  const text = (await f.exists()) ? await f.text() : ""

  let parsed: Record<string, unknown>
  try {
    parsed = (TOML.parse(text) ?? {}) as Record<string, unknown>
  } catch {
    // An unparseable file is left alone: appending to it can only make the problem harder to read.
    return false
  }
  if (table in parsed) return false

  const body = `[${table}]\n${lines.join("\n")}\n`
  await write(f, text.trim().length === 0 ? body : `${text.trimEnd()}\n\n${body}`)
  return true
}

/**
 * `key = value` inside `[table]` of TOML text: replaces the key's line when it is there, adds it under the table's
 * header when it isn't, and appends the whole table when that is missing. Line-based, for the same reason as
 * {@link appendTomlSection}: a re-serialize would drop the file's comments. `literal` is already TOML, e.g.
 * `JSON.stringify(url)`.
 */
export function setTomlValueInText(text: string, table: string, key: string, literal: string): string {
  const lines = text.split("\n")
  const start = lines.findIndex(line => line.trim() === `[${table}]`)
  if (start === -1) {
    const body = `[${table}]\n${key} = ${literal}\n`
    return text.trim().length === 0 ? body : `${text.trimEnd()}\n\n${body}`
  }

  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index]!.trimStart().startsWith("[")) break
    if (new RegExp(String.raw`^\s*${key}\s*=`).test(lines[index]!)) {
      lines[index] = `${key} = ${literal}`
      return lines.join("\n")
    }
  }
  lines.splice(start + 1, 0, `${key} = ${literal}`)
  return lines.join("\n")
}

/**
 * Sets `[table] key` in a TOML file, unlike {@link appendTomlSection} also when the table already exists, so a changed
 * answer takes effect on a re-run. An unparseable file is left alone.
 */
export async function setTomlValue(path: string, table: string, key: string, literal: string): Promise<void> {
  const f = file(path)
  const text = (await f.exists()) ? await f.text() : ""
  try {
    TOML.parse(text)
  } catch {
    return
  }
  const next = setTomlValueInText(text, table, key, literal)
  if (next !== text) await write(f, next)
}

type TomlTable = Record<string, unknown>

function isTable(value: unknown): value is TomlTable {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

// The table without its empty sub-tables, at any depth (a table left empty by that goes too).
function withoutEmptyTables(table: TomlTable): TomlTable {
  const kept: TomlTable = {}
  for (const [key, value] of Object.entries(table)) {
    if (!isTable(value)) {
      if (value !== undefined) kept[key] = value
      continue
    }
    const inner = withoutEmptyTables(value)
    if (Object.keys(inner).length > 0) kept[key] = inner
  }
  return kept
}

// Bun types TOML.stringify as possibly undefined; an object always gives text.
function tomlText(table: TomlTable): string {
  return (TOML.stringify(table) ?? "").trimEnd()
}

// A table's own values and its sub-tables, apart.
function splitTable(table: TomlTable): [TomlTable, [string, TomlTable][]] {
  const own: TomlTable = {}
  const subTables: [string, TomlTable][] = []
  for (const [key, value] of Object.entries(table)) {
    if (isTable(value)) subTables.push([key, value])
    else own[key] = value
  }
  return [own, subTables]
}

/**
 * A parent table's text with its sub-tables grouped under it, as tombi's `indent-sub-tables` lays them out: `head` is
 * the parent's `[name]` line (plus any values of its own), and each of `subTables` is one sub-table's text (comments
 * included), indented under it. A bare header sits right on its first sub-table.
 */
export function groupTomlTables(head: string, subTables: string[]): string {
  const nested = subTables.map(table => table.trimEnd().replaceAll(/^(?=.)/gm, "  "))
  const gap = head.includes("\n") ? "\n\n" : "\n"
  return nested.length > 0 ? `${head}${gap}${nested.join("\n\n")}` : head
}

/**
 * `TOML.stringify` for the TOML files Kaja writes: no empty tables, and a table with sub-tables (`[providers]`,
 * `[abilities]`) gets its own header with its sub-tables grouped under it ({@link groupTomlTables}).
 */
export function stringifyToml(data: object): string {
  const [own, tables] = splitTable(withoutEmptyTables(data as TomlTable))
  const blocks = Object.keys(own).length > 0 ? [tomlText(own)] : []
  for (const [name, table] of tables) {
    const [values, subTables] = splitTable(table)
    blocks.push(
      groupTomlTables(
        tomlText({ [name]: values }),
        subTables.map(([key, sub]) => tomlText({ [name]: { [key]: sub } }))
      )
    )
  }
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : ""
}
