import { rateLimiter } from "hono-rate-limiter"

/**
 * Global rate limiter - applies to all routes
 * Default: 100 requests per 15 minutes per IP
 */
export const globalRateLimiter = rateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  limit: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  keyGenerator: c => {
    // Try to get real IP from common proxy headers
    return c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown"
  }
})

/**
 * Strict rate limiter for authentication endpoints
 * Default: 50 requests per 15 minutes per IP (~3 requests per minute)
 * Prevents brute-force attacks while allowing normal user authentication flows
 */
export const authRateLimiter = rateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
  standardHeaders: true,
  keyGenerator: c => {
    return c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown"
  }
})
