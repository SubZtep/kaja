import { createMiddleware } from "hono/factory"
import { widgetKeyService } from "../../services"
import { forbidden, unauthorized } from "../../types/errors"

export type ResolvedWidgetKey = { id: string; userId: string; allowedOrigins: string[] }

export type WidgetVariables = { widgetKey: ResolvedWidgetKey }

/**
 * Authenticates a widget request via the `X-Kaja-Widget-Key` header (deliberately not
 * `Authorization: Bearer`, to avoid confusion with Better Auth bearer tokens in logs/proxies).
 * The key itself is not secret — it's visible in the embedding page's source — so the real
 * security boundary is the Origin check against the key's stored allowlist, not key secrecy.
 */
export const widgetKeyAuthMiddleware = createMiddleware<{ Variables: WidgetVariables }>(async (c, next) => {
  const rawKey = c.req.header("x-kaja-widget-key")
  if (!rawKey) return unauthorized(c)

  const resolved = await widgetKeyService.resolveByRawKey(rawKey)
  if (!resolved) return unauthorized(c)

  const origin = c.req.header("origin")
  if (!origin || !resolved.allowedOrigins.includes(origin)) return forbidden(c, "Origin not allowed for this key")

  c.set("widgetKey", resolved)
  void widgetKeyService.touchLastUsed(resolved.id)

  await next()
})
