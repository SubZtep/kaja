import type { Context, MiddlewareHandler, Next } from "hono"
import { getConnInfo } from "hono/bun"
import { rateLimiter } from "hono-rate-limiter"
import type { RouteVariables } from "../types"
import { env } from "./env"
import { trustedSsrClientIp } from "./ssr-client-ip"

/**
 * Rate limiting is on by default. Disable with RATE_LIMIT_ENABLED=false
 * or automatically during `bun test` (the test preload sets BUN_TEST).
 */
export function isRateLimitEnabled(): boolean {
  if (env.BUN_TEST === "1" || env.BUN_TEST === "true") return false
  if (env.RATE_LIMIT_ENABLED === false) return false
  return true
}

/**
 * The visitor's IP: the web SSR's vouched one, else the first `X-Forwarded-For` entry, else the socket's own address
 * (a local stack with no proxy); "unknown" without any. The first entry is the client because Disco's Caddy trusts no
 * proxy by default, so it drops an incoming `X-Forwarded-For` and sets its own. A CDN in front of it (Cloudflare, say)
 * would make every visitor its edge's IP: that needs Caddy's `trusted_proxies` set to the CDN's ranges first.
 */
export function clientIp(c: Context): string {
  const ssrClientIp = trustedSsrClientIp(c.req.raw.headers)
  if (ssrClientIp) return ssrClientIp
  const first = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  if (first) return first
  try {
    return getConnInfo(c).remote.address ?? "unknown"
  } catch {
    // No socket behind the request (app.request in tests)
    return "unknown"
  }
}

function skipWhenDisabled(limiter: MiddlewareHandler): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!isRateLimitEnabled()) return next()
    return limiter(c, next)
  }
}

/**
 * Global rate limiter — all routes except health checks.
 * Default: 1000 requests per 15 minutes per IP
 */
const globalRateLimiterInner = rateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  keyGenerator: clientIp,
  skip: c => c.req.path === "/health" || c.req.path.startsWith("/health/")
})

/**
 * Rate limiter for authentication endpoints — covers all of Better Auth's /auth/*
 * surface (sign-in, sign-up, session checks, CSRF, device flow), not just login
 * attempts, so normal page traffic can burn through a tight budget fast.
 *
 * Default: 2000 requests per 15 minutes per IP
 */
const authRateLimiterInner = rateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  keyGenerator: clientIp
})

/**
 * Per-user rate limiter for /nasi/turn and /nasi/turn/stream — separate from
 * the global IP-based limiter (NAT'd users would otherwise share a bucket).
 *
 * Default: 1000 requests per 10 minutes per user.
 */
const nasiTurnRateLimiterInner = rateLimiter({
  windowMs: env.NASI_TURN_RATE_LIMIT_WINDOW_MS,
  limit: env.NASI_TURN_RATE_LIMIT_MAX,
  standardHeaders: true,
  keyGenerator: (c: Context<{ Variables: RouteVariables }>) => c.get("user")?.id ?? clientIp(c)
})

/**
 * Per-visitor rate limiter for /widget/turn — keyed on the widget key plus IP,
 * since there's no authenticated user id for an anonymous widget visitor.
 *
 * Default: 300 requests per 10 minutes per (key, IP) pair.
 */
const widgetTurnRateLimiterInner = rateLimiter({
  windowMs: env.WIDGET_TURN_RATE_LIMIT_WINDOW_MS,
  limit: env.WIDGET_TURN_RATE_LIMIT_MAX,
  standardHeaders: true,
  keyGenerator: (c: Context) => `${c.req.header("x-kaja-widget-key") ?? "none"}:${clientIp(c)}`
})

/**
 * Per-key spend ceiling for /widget/turn, independent of visitor/IP diversity —
 * protects the owning account's model-provider spend regardless of how many
 * distinct visitors or IPs are hitting one widget.
 *
 * Default: 3000 requests per 10 minutes per key.
 */
const widgetKeyRateLimiterInner = rateLimiter({
  windowMs: env.WIDGET_KEY_RATE_LIMIT_WINDOW_MS,
  limit: env.WIDGET_KEY_RATE_LIMIT_MAX,
  standardHeaders: true,
  keyGenerator: (c: Context) => c.req.header("x-kaja-widget-key") ?? "none"
})

export const globalRateLimiter = skipWhenDisabled(globalRateLimiterInner)
export const authRateLimiter = skipWhenDisabled(authRateLimiterInner)
export const nasiTurnRateLimiter = skipWhenDisabled(nasiTurnRateLimiterInner)
export const widgetTurnRateLimiter = skipWhenDisabled(widgetTurnRateLimiterInner)
export const widgetKeyRateLimiter = skipWhenDisabled(widgetKeyRateLimiterInner)
