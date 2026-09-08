import { existsSync } from "node:fs"
import { deepEquals, file, TOML, write } from "bun"

/** First non-existent path among <path>.bak, <path>.bak2, ... */
export async function nextBackupPath(path: string): Promise<string> {
  let suffix = ""
  let n = 1
  while (existsSync(`${path}.bak${suffix}`)) {
    n += 1
    suffix = String(n)
  }
  return `${path}.bak${suffix}`
}

/** Writes a bundled docs/config/*.toml template to the local config dir, backing up any existing (differing) file first. */
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
  await write(path, templateText)
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
