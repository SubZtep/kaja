import { createMiddleware } from "hono/factory"
import { unauthorized } from "../../core/errors"
import { reportError } from "../../core/report"
import { widgetService } from "../../services"
import type { ResolvedWidget } from "../../services/widget"

export type WidgetVariables = { widget: ResolvedWidget }

const TOKEN_PREFIX = "kwt_"

/** The raw widget token from `Authorization: Bearer kwt_…`, or undefined when this request is not one. */
function widgetBearer(header: string | undefined): string | undefined {
  if (!header?.startsWith(`Bearer ${TOKEN_PREFIX}`)) return undefined
  return header.slice("Bearer ".length).trim()
}

/**
 * Authenticates a widget principal. The token is a secret (it is never placed in a page) and is distinct from a
 * Better Auth bearer, which uses no `kwt_` prefix.
 */
export const widgetTokenAuth = createMiddleware<{ Variables: WidgetVariables }>(async (c, next) => {
  const rawToken = widgetBearer(c.req.header("authorization"))
  if (!rawToken) return unauthorized(c)
  const widget = await widgetService.resolveByRawToken(rawToken)
  if (!widget) return unauthorized(c)
  c.set("widget", widget)
  void widgetService.touchLastUsed(widget.id).catch(error => {
    reportError("widget touchLastUsed failed", error, { widgetId: widget.id })
  })
  await next()
})
