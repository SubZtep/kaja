import { timingSafeEqual } from "node:crypto"
import { SSR_CLIENT_IP_HEADER, SSR_SECRET_HEADER } from "@kaja/schema/api"
import { env } from "./env"

/**
 * The visitor IP a web SSR request vouches for with the shared `SSR_SECRET`, or undefined when the
 * request isn't a trusted SSR call. The web's server-side fetches reach the API through the public
 * proxy, which replaces X-Forwarded-For with the web host's own IP.
 */
export function trustedSsrClientIp(headers: Headers, secret: string | undefined = env.SSR_SECRET): string | undefined {
  const sent = headers.get(SSR_SECRET_HEADER)
  if (!secret || !sent) return undefined
  const a = Buffer.from(sent)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
  return headers.get(SSR_CLIENT_IP_HEADER)?.trim() || undefined
}

/** Strips the SSR headers so Better Auth never sees them, setting X-Forwarded-For to the vouched visitor IP when trusted. */
export function withSsrClientIp(req: Request, secret: string | undefined = env.SSR_SECRET): Request {
  if (!req.headers.has(SSR_SECRET_HEADER) && !req.headers.has(SSR_CLIENT_IP_HEADER)) return req
  const ip = trustedSsrClientIp(req.headers, secret)
  const headers = new Headers(req.headers)
  headers.delete(SSR_SECRET_HEADER)
  headers.delete(SSR_CLIENT_IP_HEADER)
  if (ip) headers.set("x-forwarded-for", ip)
  return new Request(req, { headers })
}
