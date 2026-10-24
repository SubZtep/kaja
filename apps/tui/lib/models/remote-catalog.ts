import { join } from "node:path"
import { PUBLIC_CATALOG_VERSION, type PublicCatalog, publicCatalogSchema } from "@kaja/schema/api"
import { file, write } from "bun"
import { z } from "zod"
import { KAJA_USER_AGENT } from "../auth/user-agent"
import { getApiBaseUrl } from "../config/api-url"
import { log } from "../logger"
import { getPaths } from "../paths"
import { setCatalog } from "./catalog"

const cachedSchema = z.object({ etag: z.string().nullable(), catalog: publicCatalogSchema })

function getCachePath() {
  return join(getPaths().cache, "catalog.json")
}

async function readCache(): Promise<z.infer<typeof cachedSchema> | undefined> {
  try {
    const f = file(getCachePath())
    if (!(await f.exists())) return undefined
    return cachedSchema.parse(await f.json())
  } catch (error) {
    log.warn("Ignoring the cached model catalog", { error })
    return undefined
  }
}

// A catalog this build can use: one it knows the shape of, and no API key headed for plain http.
function usable(catalog: PublicCatalog): PublicCatalog {
  if (catalog.version !== PUBLIC_CATALOG_VERSION)
    throw new Error(`catalog version ${catalog.version}, this build reads ${PUBLIC_CATALOG_VERSION}`)
  const plain = catalog.providers.find(
    provider => provider.kind === "hosted" && !provider.base_url.startsWith("https:")
  )
  if (plain) throw new Error(`hosted provider "${plain.id}" is not https`)
  return catalog
}

/**
 * Asks the API for its provider catalog (`GET /config/catalog`) and makes it the wizard's. The last good one is kept in
 * the cache dir, so an unchanged catalog is a 304 and an unreachable API still offers it. True when a catalog is in
 * use; false (none at all) leaves the wizard asking for every detail itself.
 */
export async function refreshCatalog(timeoutMs = 2000): Promise<boolean> {
  const cached = await readCache()
  try {
    const res = await fetch(new URL("/config/catalog", getApiBaseUrl()), {
      headers: { "User-Agent": KAJA_USER_AGENT, ...(cached?.etag ? { "If-None-Match": cached.etag } : {}) },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (res.status === 304 && cached) {
      setCatalog(usable(cached.catalog))
      return true
    }
    if (!res.ok) throw new Error(`GET /config/catalog failed: ${res.status} ${res.statusText}`)

    const catalog = usable(publicCatalogSchema.parse(await res.json()))
    setCatalog(catalog)
    await write(getCachePath(), JSON.stringify({ etag: res.headers.get("etag"), catalog })).catch((error: unknown) =>
      log.warn("Couldn't cache the model catalog", { error })
    )
    return true
  } catch (error) {
    try {
      if (cached) {
        setCatalog(usable(cached.catalog))
        log.warn("Using the cached model catalog", { error })
        return true
      }
    } catch (cacheError) {
      log.warn("The cached model catalog is unusable", { error: cacheError })
    }
    log.warn("No model catalog", { error })
    setCatalog(undefined)
    return false
  }
}
