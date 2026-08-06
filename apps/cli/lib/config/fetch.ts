import { existsSync } from "node:fs"
import { file, write } from "bun"
import { t } from "../i18n"

/** First non-existent path among <path>.bak, <path>.bak2, ... Uses node:fs's existsSync (not Bun.file().exists()) since this must also work for directory paths (see `kaja config wipe`). */
export async function nextBackupPath(path: string): Promise<string> {
  let suffix = ""
  let n = 1
  while (existsSync(`${path}.bak${suffix}`)) {
    n += 1
    suffix = String(n)
  }
  return `${path}.bak${suffix}`
}

/** Downloads a text config file from the Kaja API and writes it to `path`, backing up any existing file first. `token` is the API CONFIG_API_TOKEN (Bearer), required on servers with fail-closed config auth. */
export async function fetchTomlConfig(
  apiBaseUrl: string,
  route: string,
  path: string,
  token?: string
): Promise<{ path: string; backedUpTo?: string }> {
  const url = new URL(route, apiBaseUrl)
  const headers: HeadersInit = {}
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
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
