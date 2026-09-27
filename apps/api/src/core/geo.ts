import { isIP } from "node:net"
import { isPrivateAddress } from "@kaja/shared/net"
import { env } from "./env"
import { reportError } from "./report"

const LOOKUP_TIMEOUT_MS = 5000

/** Where an IP is: the service's whole answer, plus the parts routing and display use. */
export type GeoLocation = {
  raw: Record<string, unknown>
  country: string | null
  countryCode: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
}

type LookupAnswer = {
  country?: { name?: string; isoCode?: string }
  city?: { name?: string }
  location?: { latitude?: number; longitude?: number }
}

let lookupOverride: ((ip: string) => Promise<GeoLocation | undefined>) | undefined

/** Test seam: answers lookups instead of the geolocation service. Pass undefined to restore it. */
export function setGeoLookupOverride(lookup: typeof lookupOverride) {
  lookupOverride = lookup
}

/** Looks a public IP up in GEO_API_URL (github.com/SubZtep/geo-service); undefined for a private or malformed one, without GEO_API_KEY, or when the lookup fails. */
export async function lookupGeo(ip: string | undefined): Promise<GeoLocation | undefined> {
  if (!ip || !isIP(ip) || isPrivateAddress(ip)) return undefined
  if (lookupOverride) return lookupOverride(ip)
  if (!env.GEO_API_KEY) return undefined
  try {
    const res = await fetch(new URL(`/lookup/${encodeURIComponent(ip)}`, env.GEO_API_URL), {
      headers: { "X-API-Key": env.GEO_API_KEY },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
    })
    if (!res.ok) throw new Error(`the geolocation service answered ${res.status}`)
    const raw = (await res.json()) as Record<string, unknown>
    const answer = raw as LookupAnswer
    return {
      raw,
      country: answer.country?.name ?? null,
      countryCode: answer.country?.isoCode ?? null,
      city: answer.city?.name ?? null,
      latitude: typeof answer.location?.latitude === "number" ? answer.location.latitude : null,
      longitude: typeof answer.location?.longitude === "number" ? answer.location.longitude : null
    }
  } catch (error) {
    reportError("Couldn't look a sandbox's IP up", error)
    return undefined
  }
}
