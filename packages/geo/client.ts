import type { Context } from "hono"
import { getConnInfo } from "hono/bun"

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
  const info = getConnInfo(c)

  // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2...)
  // Take the first one which is the original client
  const clientIp = forwardedFor?.split(",")[0]?.trim() || realIp || info.remote.address

  if (!clientIp) return undefined

  // Strip IPv4-mapped IPv6 prefix if present
  const cleanIp = clientIp.startsWith("::ffff:") ? clientIp.substring(7) : clientIp

  // Skip private/local IPs
  const isPrivate = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|fe80:)/i.test(cleanIp)

  return isPrivate ? undefined : cleanIp
}
