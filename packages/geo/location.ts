import fs from "node:fs"
import path from "node:path"
import { Reader } from "@maxmind/geoip2-node"
import type { GeoLocation } from "./types"

const mmdbPath = path.join(__dirname, "data", "GeoLite2-City.mmdb")
let reader: ReturnType<typeof Reader.openBuffer> | undefined
let triedInit = false

function getReader() {
  if (triedInit) return reader
  triedInit = true

  try {
    if (!fs.existsSync(mmdbPath)) return undefined
    const dbBuffer = fs.readFileSync(mmdbPath)
    reader = Reader.openBuffer(dbBuffer)
    return reader
  } catch {
    return undefined
  }
}

/**
 * Get the geo location of the given IP address. Safe to use in the **api** app.
 * @param ip - The IP address to get the geo location of.
 * @returns The geo location of the given IP address or undefined if the IP address is not found.
 */
export function getGeoLocation(ip: string): GeoLocation | undefined {
  try {
    const city = getReader()?.city(ip)
    if (city) {
      return {
        continent: city.continent
          ? {
              geonameId: city.continent.geonameId,
              name: city.continent.names.en
            }
          : undefined,
        country: city.country
          ? {
              geonameId: city.country.geonameId,
              name: city.country.names.en
            }
          : undefined,
        city: city.city
          ? {
              geonameId: city.city.geonameId,
              name: city.city.names.en
            }
          : undefined,
        location: city.location
          ? {
              accuracyRadius: city.location.accuracyRadius,
              latitude: city.location.latitude,
              longitude: city.location.longitude,
              timeZone: city.location.timeZone
            }
          : undefined
      }
    }
  } catch (error) {
    console.error(`Error getting geo location: ${error instanceof Error ? error.message : String(error)}`)
  }
  return undefined
}
