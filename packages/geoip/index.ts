import fs from "node:fs"
import path from "node:path"
import { Reader } from "@maxmind/geoip2-node"

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

export function getCity(ip: string) {
  try {
    const city = getReader()?.city(ip)
    console.log(city)
    return city
  } catch {
    return undefined
  }
}
