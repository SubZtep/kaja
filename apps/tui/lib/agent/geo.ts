import { type GeoLocation, lookupMyLocation as nasiLookup } from "@kaja/nasi"
import { services } from "../config/services"
import { log } from "../logger"

export type { GeoLocation }

export async function lookupMyLocation(): Promise<GeoLocation> {
  const { location } = await services()
  if (!location) throw new Error("Location feature not configured")
  return nasiLookup({ serviceUrl: location.serviceUrl, apiKey: location.apiKey })
}

export async function tryLookupMyLocation(): Promise<GeoLocation | undefined> {
  try {
    return await lookupMyLocation()
  } catch (error) {
    log.warn("Failed to look up location", { error })
    return undefined
  }
}
