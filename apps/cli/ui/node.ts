import { getCurrentIp, getGeoLocation } from "@kaja/geo"

export async function spawnNode() {
  const ip = await getCurrentIp()
  if (ip) {
    const geo = getGeoLocation(ip)
    if (geo) {
      console.log("geo location", geo)
    }
  }
}
