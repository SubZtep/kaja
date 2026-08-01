import { file, write } from "bun"
import { t } from "./i18n"

/**
 * First non-existent path among <path>.bak, <path>.bak2, <path>.bak3, ...
 * so a fetch never clobbers a previous backup.
 */
async function nextBackupPath(path: string): Promise<string> {
  let suffix = ""
  let n = 1
  while (await file(`${path}.bak${suffix}`).exists()) {
    n += 1
    suffix = String(n)
  }
  return `${path}.bak${suffix}`
}

/**
 * Downloads a text config file from the Kaja API and writes it to `path`. An
 * existing file is renamed to .bak (.bak2, .bak3, ...) rather than
 * overwritten in place, so a bad fetch is always recoverable.
 */
export async function fetchTomlConfig(
  apiBaseUrl: string,
  route: string,
  path: string
): Promise<{ path: string; backedUpTo?: string }> {
  const url = new URL(route, apiBaseUrl)
  const res = await fetch(url)
  if (!res.ok) throw new Error(t("config.fetchFailed", { status: String(res.status) }))
  const toml = await res.text()

  const f = file(path)
  let backedUpTo: string | undefined
  if (await f.exists()) {
    backedUpTo = await nextBackupPath(path)
    await write(backedUpTo, f)
  }
  await write(path, toml)
  return { path, backedUpTo }
}
