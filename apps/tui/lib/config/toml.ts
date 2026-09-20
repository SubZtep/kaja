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
  await write(f, text.trim().length === 0 ? body : `${text.replace(/\n+$/, "")}\n\n${body}`)
  return true
}
