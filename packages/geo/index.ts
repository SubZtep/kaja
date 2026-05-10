import fs from "node:fs"
import path from "node:path"
import { Reader } from "@maxmind/geoip2-node"

interface GeoLocation {
  continent: {
    geonameId: number
    name: string
  }
  country: {
    geonameId: number
    name: string
  }
  city: {
    geonameId: number
    name: string
  }
  location: {
    accuracyRadius: number
    latitude: number
    longitude: number
    timeZone: string
  }
}

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
    console.log(city)
    // return city
  } catch {
    return undefined
  }
}

const currentIpProviders = ["https://api64.ipify.org?format=json", "https://api.ipify.org?format=json"]

export async function getCurrentIp() {
  for (const url of currentIpProviders) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const payload = await response.json()
      const ip = payload?.ip
      if (typeof ip === "string" && ip.length > 0) return ip
    } catch {
      // Try next provider.
    }
  }

  return undefined
}
