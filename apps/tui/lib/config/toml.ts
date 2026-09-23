import { file, TOML, write } from "bun"

/**
 * Adds a table to a TOML config file when it isn't there yet, by appending text rather than
 * re-serializing: these files are hand-edited and mostly commented-out examples, all of which a
 * parse-and-stringify round trip would throw away.
 *
 * Returns false and changes nothing when the table is already present, so a section the user has
 * configured themselves is never overwritten.
 */
export async function appendTomlSection(path: string, table: string, lines: string[]): Promise<boolean> {
  const f = file(path)
  const text = (await f.exists()) ? await f.text() : ""

  let parsed: Record<string, unknown> = {}
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
 * `key = value` inside `[table]` of TOML text: replaces the key's line when it is there, adds it under
 * the table's header when it isn't, and appends the whole table when that is missing. Line-based, for
 * the same reason as {@link appendTomlSection}: a re-serialize would drop the file's comments.
 * `literal` is already TOML, e.g. `JSON.stringify(url)`.
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
 * Sets `[table] key` in a TOML file, unlike {@link appendTomlSection} also when the table already
 * exists, so a changed answer takes effect on a re-run. An unparseable file is left alone.
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
