import type { Context, MiddlewareHandler, Next } from "hono"
import { rateLimiter } from "hono-rate-limiter"
import type { RouteVariables } from "../types"

/**
 * Rate limiting is on by default. Disable with RATE_LIMIT_ENABLED=false
 * or automatically during `bun test` (BUN_TEST is set by the test runner).
 */
export function isRateLimitEnabled(): boolean {
  if (process.env.BUN_TEST === "1" || process.env.BUN_TEST === "true") return false
  if (process.env.RATE_LIMIT_ENABLED === "false") return false
  return true
}

function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown"
}

function skipWhenDisabled(limiter: MiddlewareHandler): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!isRateLimitEnabled()) return next()
    return limiter(c, next)
  }
}

/**
 * Global rate limiter — all routes except health checks.
 * Default: 300 requests per 15 minutes per IP
 */
const globalRateLimiterInner = rateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  keyGenerator: clientIp,
  skip: c => c.req.path === "/health" || c.req.path.startsWith("/health/")
})

/**
 * Rate limiter for authentication endpoints.
 *
 * Default: 500 requests per 15 minutes per IP
 */
const authRateLimiterInner = rateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 500,
  standardHeaders: true,
  keyGenerator: clientIp
})

/**
 * Per-user rate limiter for /nasi/turn and /nasi/turn/stream — separate from
 * the global IP-based limiter (NAT'd users would otherwise share a bucket).
 *
 * Default: 300 requests per 10 minutes per user.
 */
const nasiTurnRateLimiterInner = rateLimiter({
  windowMs: Number(process.env.NASI_TURN_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000,
  limit: Number(process.env.NASI_TURN_RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  keyGenerator: (c: Context<{ Variables: RouteVariables }>) => c.get("user")?.id ?? clientIp(c)
})

export const globalRateLimiter = skipWhenDisabled(globalRateLimiterInner)
export const authRateLimiter = skipWhenDisabled(authRateLimiterInner)
export const nasiTurnRateLimiter = skipWhenDisabled(nasiTurnRateLimiterInner)
