import { configCatalogSchema } from "@kaja/schema/api"
import { CATALOG_VERSION } from "@kaja/schema/config"
import { KAJA_USER_AGENT } from "../auth/user-agent"
import { getApiBaseUrl } from "../config/api-url"
import { log } from "../logger"
import { setCatalog } from "./catalog"

/**
 * Asks the API for its model catalog (`GET /config/catalog`) and makes it the wizard's, so a changed default needs no
 * CLI release. Any failure (offline, a slow server, a bad or newer-than-known payload) keeps the bundled catalog; true
 * when the API's is in use.
 */
export async function refreshCatalog(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(new URL("/config/catalog", getApiBaseUrl()), {
      headers: { "User-Agent": KAJA_USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) throw new Error(`GET /config/catalog failed: ${res.status} ${res.statusText}`)

    const { version, catalog } = configCatalogSchema.parse(await res.json())
    if (version !== CATALOG_VERSION) throw new Error(`catalog version ${version}, this build reads ${CATALOG_VERSION}`)
    // The user types an API key for a hosted provider, so the address it goes to must not be plain http.
    const plain = catalog.providers.find(
      provider => provider.kind === "hosted" && !provider.base_url.startsWith("https:")
    )
    if (plain) throw new Error(`hosted provider "${plain.id}" is not https`)

    setCatalog(catalog)
    return true
  } catch (error) {
    log.warn("Using the bundled model catalog", { error })
    return false
  }
}
