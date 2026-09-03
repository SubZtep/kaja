/**
 * Standardized error response types for API routes
 */

import type { Context } from "hono"
import { z } from "zod"

export const errorResponseSchema = z.object({
  error: z.string()
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

/**
 * Type-safe error response helpers
 * Use `as any` to work around Hono's typed response system
 */
export function unauthorized(c: Context) {
  return c.json({ error: "Unauthorized" }, 401) as any
}

export function notFound(c: Context, message = "Not found") {
  return c.json({ error: message }, 404) as any
}

export function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400) as any
}

export function internalError(c: Context, message = "Internal server error") {
  return c.json({ error: message }, 500) as any
}

export function badGateway(c: Context, message = "Upstream provider error") {
  return c.json({ error: message }, 502) as any
}

export function forbidden(c: Context, message = "Forbidden") {
  return c.json({ error: message }, 403) as any
}
