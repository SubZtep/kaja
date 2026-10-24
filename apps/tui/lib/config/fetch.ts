import { existsSync } from "node:fs"
import { extname } from "node:path"
import { deepEquals, file, TOML, write } from "bun"
import { writeConfigFile } from "./schema-file"

/**
 * First non-existent path among <name>.bak.<ext>, <name>.bak.2.<ext>, ... — the extension stays last so editors still
 * highlight and validate the backup.
 */
export async function nextBackupPath(path: string): Promise<string> {
  const ext = extname(path)
  const stem = path.slice(0, path.length - ext.length)
  let candidate = `${stem}.bak${ext}`
  let n = 2
  while (existsSync(candidate)) candidate = `${stem}.bak.${n++}${ext}`
  return candidate
}

/**
 * Writes a config file Kaja generated (models.toml from the catalog, hooks.toml), backing up an existing one first
 * unless it already holds the same.
 */
export async function writeTemplateConfig(
  templateText: string,
  path: string
): Promise<{ path: string; backedUpTo?: string; unchanged?: boolean }> {
  const f = file(path)
  const exists = await f.exists()
  const existingText = exists ? await f.text() : undefined

  if (exists && existingText !== undefined && isUnchanged(templateText, existingText)) {
    return { path, unchanged: true }
  }

  let backedUpTo: string | undefined
  if (exists) {
    backedUpTo = await nextBackupPath(path)
    await write(backedUpTo, f)
  }
  await writeConfigFile(path, templateText)
  return { path, backedUpTo }
}

/** Parses both sides as TOML and deep-compares the resulting objects. */
function isUnchanged(templateText: string, existingText: string): boolean {
  try {
    const templateData = TOML.parse(templateText)
    const existingData = TOML.parse(existingText)
    return deepEquals(templateData, existingData)
  } catch {
    return templateText === existingText
  }
}
