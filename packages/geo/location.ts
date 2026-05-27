import fs from "node:fs"
import path from "node:path"
import { Reader } from "@maxmind/geoip2-node"
import { logger } from "./logger"
import type { GeoLocation } from "./types"

let reader: ReturnType<typeof Reader.openBuffer> | undefined
let triedInit = false

function getReader() {
  if (triedInit) return reader
  triedInit = true

  // Check paths at runtime, not at module load time (important for bundled builds)
  const possiblePaths = [
    process.env.GEOIP_DB_PATH, // Custom path from environment
    "/usr/share/GeoIP/GeoLite2-City.mmdb", // System-wide location (geoipupdate default)
    path.join(__dirname, "data", "GeoLite2-City.mmdb") // Bundled with app
  ].filter((p): p is string => typeof p === "string")

  const mmdbPath = possiblePaths.find(p => fs.existsSync(p))

  try {
    if (!mmdbPath) {
      logger.warn(
        { possiblePaths },
        "GeoIP database not found. Set GEOIP_DB_PATH environment variable or install geoipupdate."
      )
      return undefined
    }
    const dbBuffer = fs.readFileSync(mmdbPath)
    reader = Reader.openBuffer(dbBuffer)
    logger.info({ mmdbPath }, "GeoIP database loaded")
    return reader
  } catch (error) {
    logger.error({ error }, "Failed to load GeoIP database")
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
