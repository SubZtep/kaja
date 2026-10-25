import { basename, dirname, join } from "node:path"
import { tombiSchemas } from "@kaja/schema/tombi"
import { file, write } from "bun"

/** The JSON Schema that validates each file Kaja writes into the config dir, backups included. */
const SCHEMA_OF: Record<string, keyof typeof tombiSchemas> = {
  settings: "settings.json",
  models: "models.json",
  secrets: "secrets.json",
  commands: "commands.json",
  hooks: "hooks.json"
}

// `models.bak.2.toml` validates like `models.toml`
function schemaFor(path: string): keyof typeof tombiSchemas | undefined {
  const stem = basename(path).replace(/(\.bak(\.\d+)?)?\.toml$/, "")
  return SCHEMA_OF[stem]
}

/**
 * `text` with a `#:schema` line on top pointing at the schema copy beside it, so an editor with a TOML language server
 * (Tombi, Taplo) validates and documents the file. Unchanged for a file without a schema, or one that already names
 * one.
 */
export function withSchemaLine(path: string, text: string): string {
  const schema = schemaFor(path)
  if (!schema || text.startsWith("#:schema")) return text
  return `#:schema ./schemas/${schema}\n\n${text}`
}

/** Writes this build's schema for `path` into the `schemas/` folder beside it, when it isn't there already. */
export async function writeSchemaCopy(path: string): Promise<void> {
  const schema = schemaFor(path)
  if (!schema) return
  const target = file(join(dirname(path), "schemas", schema))
  // Compared as data, so a reformatted copy (or a dev link to the repo's formatted schemas) is left alone
  const current = await target.json().catch(() => undefined)
  if (!Bun.deepEquals(current, tombiSchemas[schema]))
    await write(target, `${JSON.stringify(tombiSchemas[schema], null, 2)}\n`)
}

/** Writes a config file with its `#:schema` line, and the schema it points at. */
export async function writeConfigFile(path: string, text: string): Promise<void> {
  await writeSchemaCopy(path)
  await write(path, withSchemaLine(path, text))
}
