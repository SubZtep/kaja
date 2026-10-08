import { join } from "node:path"
import { compileSafeCommands, DEFAULT_SAFE_COMMANDS } from "@kaja/nasi"
import { CommandsFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// First-run commands.toml template (also documents commands.toml on the docs site).
import TEMPLATE from "../../../../config/commands.toml" with { type: "text" }
import { log } from "../logger"
import { getConfigDir } from "./config"
import { writeTemplateConfig } from "./fetch"

export function getCommandsPath() {
  return join(getConfigDir(), "commands.toml")
}

/** The compiled patterns from commands.toml (`safe` plus `custom`); a missing file is written from the template. A broken file or pattern never stops the app: it is logged and skipped, and a broken file falls back to the built-in list. */
export async function loadSafeCommands(): Promise<RegExp[]> {
  const path = getCommandsPath()
  const f = file(path)
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  let sources: string[]
  try {
    const { safe, custom } = CommandsFileSchema.parse(TOML.parse(exists ? await f.text() : TEMPLATE))
    sources = [...safe, ...custom]
  } catch (error) {
    log.warn("commands.toml is invalid, using the built-in safe commands", { path, error })
    sources = [...DEFAULT_SAFE_COMMANDS]
  }
  const { patterns, invalid } = compileSafeCommands(sources)
  for (const source of invalid) log.warn("Ignoring an invalid pattern in commands.toml", { path, pattern: source })
  return patterns
}

/** Writes fresh defaults (`text`, from the bundle or the template) over commands.toml, keeping the user's `custom` patterns and backing the old file up like every other fetched file. */
export async function fetchCommandsToml(text: string = TEMPLATE) {
  const path = getCommandsPath()
  const f = file(path)
  let custom: string[] = []
  if (await f.exists()) {
    try {
      custom = CommandsFileSchema.parse(TOML.parse(await f.text())).custom
    } catch {
      // an unreadable file has nothing worth keeping; it is backed up below
    }
  }
  if (custom.length === 0) return writeTemplateConfig(text, path)
  // The template's commented `custom` example gives way to the user's real entries
  const base = text.replace(/\n# custom = \[[\s\S]*$/, "\n")
  const entries = custom.map(pattern => `  ${JSON.stringify(pattern)}`).join(",\n")
  return writeTemplateConfig(`${base}\ncustom = [\n${entries}\n]\n`, path)
}
