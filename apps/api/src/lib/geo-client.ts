import { error, trace } from "@kaja/logger"
import type { GeoLocation } from "@kaja/schema/api"
import type { Context } from "hono"
import { getConnInfo } from "hono/bun"

/**
 * Get the geo location of the given IP address by calling the geo-service API.
 * @param ip - The IP address to get the geo location of.
 * @returns The geo location of the given IP address or undefined if the IP address is not found.
 */
export async function getGeoLocation(ip: string): Promise<GeoLocation | undefined> {
  const geoServiceUrl = process.env.GEO_SERVICE_URL
  const geoServiceApiKey = process.env.GEO_SERVICE_API_KEY

  if (!geoServiceUrl || !geoServiceApiKey) {
    error("GEO_SERVICE_URL or GEO_SERVICE_API_KEY not configured", {
      hasUrl: !!geoServiceUrl,
      hasApiKey: !!geoServiceApiKey
    })
    return undefined
  }

  try {
    trace("Calling geo-service", { url: `${geoServiceUrl}/lookup/${ip}` })

    // Create AbortController with 120-second timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 120 seconds

    const response = await fetch(`${geoServiceUrl}/lookup/${ip}`, {
      headers: {
        "X-API-Key": geoServiceApiKey
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 404) {
        trace("Location not found for IP", { ip })
        return undefined
      }
      error("Geo-service returned error", {
        status: response.status,
        statusText: response.statusText,
        ip
      })
      return undefined
    }

    const data = await response.json()
    trace("Got location data from geo-service", { ip, data })
    return data as GeoLocation
  } catch (err) {
    error("Failed to call geo-service", { error: err, ip })
    return undefined
  }
}

/**
 * Extract the real client IP address from a Hono context.
 * Handles proxy headers (X-Forwarded-For, X-Real-IP) and strips IPv4-mapped IPv6 prefixes.
 * Returns undefined for private/local IP addresses.
 *
 * @param c - Hono context
 * @returns The client's public IP address, or undefined if unavailable or private
 */
export function getClientIp(c: Context): string | undefined {
  // Get real client IP from proxy headers, fallback to direct connection
  const forwardedFor = c.req.header("x-forwarded-for")
  const realIp = c.req.header("x-real-ip")

  // In test environment, getConnInfo may fail, so we handle it gracefully
  let connInfo
  try {
    connInfo = getConnInfo(c)
  } catch {
    // In tests or when not using Bun server, fall back to headers only
    connInfo = null
  }
  const info = connInfo

  // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2...)
  // Take the first one which is the original client
  const clientIp = forwardedFor?.split(",")[0]?.trim() || realIp || info?.remote?.address

  if (!clientIp) return undefined

  // Strip IPv4-mapped IPv6 prefix if present
  const cleanIp = clientIp.startsWith("::ffff:") ? clientIp.substring(7) : clientIp

  // Skip private/local IPs
  const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|fe80:)/i.test(cleanIp)

  return isPrivate ? undefined : cleanIp
}
