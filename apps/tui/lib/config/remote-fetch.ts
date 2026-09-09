import { unlink } from "node:fs/promises"
import { join } from "node:path"
import { configExportBundleSchema } from "@kaja/schema/api"
import { file, write } from "bun"
import { getPaths } from "../paths"
import { getApiBaseUrl } from "./services"

function getEtagCachePath() {
  return join(getPaths().temp, "kaja-config-fetch-etag")
}

async function readCachedEtag(): Promise<string | undefined> {
  try {
    const f = file(getEtagCachePath())
    if (!(await f.exists())) return undefined
    return (await f.text()).trim() || undefined
  } catch {
    return undefined
  }
}

async function writeCachedEtag(etag: string) {
  try {
    await write(getEtagCachePath(), etag)
  } catch {}
}

/** Drops the cached ETag so the next fetch always gets a full body. Called by `kaja config wipe` — the cache lives in the temp dir, so wiping the config dir alone would leave a 304 claiming files are up to date when they no longer exist. */
export async function clearCachedEtag() {
  try {
    await unlink(getEtagCachePath())
  } catch {}
}

export type RemoteBundle = { files: Record<string, string> } | { unchanged: true }

/** Downloads the admin-managed defaults bundle from `GET {apiBaseUrl}/config/export`, honouring the cached ETag (returns `{ unchanged: true }` on a 304) unless `useEtagCache` is false. Throws on a network error or non-2xx/304 response — callers fall back to the bundled templates. */
export async function fetchRemoteConfigBundle(useEtagCache = true): Promise<RemoteBundle> {
  const apiBaseUrl = await getApiBaseUrl()
  const cachedEtag = useEtagCache ? await readCachedEtag() : undefined

  const res = await fetch(new URL("/config/export", apiBaseUrl), {
    headers: cachedEtag ? { "If-None-Match": cachedEtag } : {}
  })

  if (res.status === 304) return { unchanged: true }
  if (!res.ok) throw new Error(`GET /config/export failed: ${res.status} ${res.statusText}`)

  const bundle = configExportBundleSchema.parse(await res.json())
  const etag = res.headers.get("etag")
  if (etag && useEtagCache) await writeCachedEtag(etag)
  return { files: bundle.files }
}
