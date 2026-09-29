/**
 * Standardized error response types for API routes
 */

import { ModelUnavailableError, NoModelError, NothingToApproveError, SessionNotFoundError } from "@kaja/nasi"
import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

/** What a client hears about a known turn failure, or undefined for anything else (a crash, to report). */
export function knownTurnError(error: unknown): { status: ContentfulStatusCode; message: string } | undefined {
  if (error instanceof SessionNotFoundError) return { status: 404, message: "Session not found" }
  if (error instanceof NothingToApproveError) return { status: 409, message: "No tool call is waiting for approval" }
  if (error instanceof NoModelError) return { status: 503, message: "No model available" }
  if (error instanceof ModelUnavailableError) return { status: 502, message: error.message }
  return undefined
}

/** The JSON error response for a known turn failure, or undefined when `error` isn't one. */
export function knownTurnErrorResponse(c: Context, error: unknown) {
  const known = knownTurnError(error)
  return known && (c.json({ error: known.message }, known.status) as any)
}

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

export function conflict(c: Context, message: string) {
  return c.json({ error: message }, 409) as any
}

export function serviceUnavailable(c: Context, message: string) {
  return c.json({ error: message }, 503) as any
}
