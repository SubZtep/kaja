import { existsSync } from "node:fs"
import { deepEquals, file, TOML, write } from "bun"
import { t } from "../i18n"

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

/**
 * Downloads a text config file from the Kaja API.
 *
 * @param path Write location
 * @param token The API CONFIG_API_TOKEN (Bearer), required on servers with fail-closed config auth
 */
export async function fetchTomlConfig(
  apiBaseUrl: string,
  route: string,
  path: string,
  token?: string,
  /** Merges the existing parsed object into the freshly fetched one before comparing, e.g. carrying over a locally-set field the server response never had so it doesn't cause a false "changed" every run. */
  merge?: (fetched: Record<string, unknown>, existing: Record<string, unknown>) => Record<string, unknown>
): Promise<{ path: string; backedUpTo?: string; unchanged?: boolean }> {
  const url = new URL(route, apiBaseUrl)
  const headers: HeadersInit = {}
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(t("config.fetchFailed", { status: String(res.status) }))
  const fetchedText = await res.text()

  const f = file(path)
  const exists = await f.exists()
  const existingText = exists ? await f.text() : undefined

  if (exists && existingText !== undefined) {
    const same = isUnchanged(fetchedText, existingText, merge)
    if (same) return { path, unchanged: true }
  }

  let backedUpTo: string | undefined
  if (exists) {
    backedUpTo = await nextBackupPath(path)
    await write(backedUpTo, f)
  }
  await write(path, fetchedText)
  return { path, backedUpTo }
}

/**
 * Parses both sides as TOML and deep-compares the resulting objects
 *
 * @param merge Merge records before comparison
 */
function isUnchanged(
  fetchedText: string,
  existingText: string,
  merge?: (fetched: Record<string, unknown>, existing: Record<string, unknown>) => Record<string, unknown>
): boolean {
  try {
    const fetchedData = TOML.parse(fetchedText) as Record<string, unknown>
    const existingData = TOML.parse(existingText) as Record<string, unknown>
    const merged = merge ? merge(fetchedData, existingData) : fetchedData
    return deepEquals(merged, existingData)
  } catch {
    return fetchedText === existingText
  }
}
