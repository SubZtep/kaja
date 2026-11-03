import { existsSync, realpathSync } from "node:fs"
import { basename, join } from "node:path"
import type { tombiSchemas } from "@kaja/schema/tombi"
import { write } from "bun"

/** Where the published JSON Schemas live: the schema package on main. */
export const SCHEMA_BASE_URL = "https://raw.githubusercontent.com/SubZtep/kaja/refs/heads/main/packages/schema/json"

// The checkout's schemas (apps/tui/src/lib/config → packages/schema/json); a compiled binary has none.
const REPO_SCHEMA_DIR = join(import.meta.dir, "../../../../../packages/schema/json")

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

/** Where a `#:schema` line points: the checkout's real path under `KAJA_PROFILE=dev`, else the published copy on main. */
export function schemaRef(schema: keyof typeof tombiSchemas, repoDir = REPO_SCHEMA_DIR): string {
  const local = join(repoDir, schema)
  if (Bun.env.KAJA_PROFILE === "dev" && existsSync(local)) return realpathSync(local)
  return `${SCHEMA_BASE_URL}/${schema}`
}

/**
 * `text` with a `#:schema` line on top, so an editor with a TOML language server (Tombi, Taplo) validates and documents
 * the file. An existing `#:schema` line is replaced; a file without a schema is unchanged.
 */
export function withSchemaLine(path: string, text: string): string {
  const schema = schemaFor(path)
  if (!schema) return text
  const body = text.replace(/^#:schema [^\n]*\n\n?/, "")
  return `#:schema ${schemaRef(schema)}\n\n${body}`
}

/** Writes a config file with its `#:schema` line. */
export async function writeConfigFile(path: string, text: string): Promise<void> {
  await write(path, withSchemaLine(path, text))
}
