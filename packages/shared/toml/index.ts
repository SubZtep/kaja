import { TOML } from "bun"

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
