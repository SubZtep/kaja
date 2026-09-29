import { csrf } from "hono/csrf"
import { createMiddleware } from "hono/factory"
import { env } from "./env"

const originCheck = csrf({ origin: env.CORS_ORIGIN })

/**
 * CSRF guard for cookie sessions: a write that carries the session cookie must come from the web app (Origin is
 * CORS_ORIGIN). The cookie can be SameSite=None (CROSS_PARENT_DOMAIN), so the browser alone won't stop another site's
 * form or no-cors fetch. Calls with an Authorization header, or without cookies (TUI, sandbox, widget visitors), can't
 * be forged cross-site and pass untouched.
 */
export const csrfProtection = createMiddleware((c, next) => {
  if (!c.req.header("cookie") || c.req.header("authorization")) return next()
  return originCheck(c, next)
})
