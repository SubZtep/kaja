export interface GeoLocation {
  continent: { geonameId: number; name: string; code: string }
  country: {
    geonameId: number
    name: string
    isoCode: string
    isInEuropeanUnion: boolean
  }
  subdivisions: { geonameId: number; name: string; isoCode: string }[]
  city: { geonameId: number; name: string }
  postalCode?: string
  location: {
    accuracyRadius: number
    latitude: number
    longitude: number
    timeZone: string
  }
}

export type GeoLookupConfig = {
  serviceUrl: string
  apiKey?: string
  /** When set, skip ipify and look this address up (hosted: request IP). */
  ip?: string
}

/**
 * Resolves a public IP and looks up its geographic location via the
 * geo-service API. Result is cached per process.
 */
let cached: GeoLocation | null = null

export async function lookupMyLocation(config: GeoLookupConfig): Promise<GeoLocation> {
  if (cached) return cached

  let ip = config.ip?.trim()
  if (!ip) {
    const ipRes = await fetch("https://api.ipify.org")
    if (!ipRes.ok) throw new Error(`Public IP lookup failed: ${ipRes.status}`)
    ip = (await ipRes.text()).trim()
  }

  const res = await fetch(`${config.serviceUrl.replace(/\/$/, "")}/lookup/${ip}`, {
    headers: {
      ...(config.apiKey ? { "X-API-Key": config.apiKey } : {})
    }
  })
  if (!res.ok) throw new Error(`Geo lookup failed: ${res.status} ${await res.text()}`)
  cached = (await res.json()) as GeoLocation
  return cached
}

/** Like {@link lookupMyLocation}, but resolves to `undefined` instead of throwing. */
export async function tryLookupMyLocation(config?: GeoLookupConfig): Promise<GeoLocation | undefined> {
  if (!config?.serviceUrl) return undefined
  try {
    return await lookupMyLocation(config)
  } catch {
    return undefined
  }
}

/** Test hook: drop the process-wide cache. */
export function resetLocationCache() {
  cached = null
}
