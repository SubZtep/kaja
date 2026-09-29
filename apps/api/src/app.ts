import { OpenAPIHono } from "@hono/zod-openapi"
import { sentry } from "@sentry/hono/bun"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import pkg from "../package.json" with { type: "json" }
import { csrfProtection } from "./core/csrf"
import { env } from "./core/env"
import { authRateLimiter, globalRateLimiter } from "./core/rate-limit"
import { abilityRoutes } from "./features/abilities"
import { adminRoutes } from "./features/admin"
import { authMiddleware, authRoutes } from "./features/auth"
import { configRoutes } from "./features/config"
import { configExportRoutes } from "./features/config-export"
import { healthRoutes } from "./features/health"
import { nasiRoutes } from "./features/nasi"
import { referenceRoutes, setupApiDocs } from "./features/reference"
import { sandboxRoutes } from "./features/sandbox"
import { statsRoutes } from "./features/stats"
import { telegramAdminRoutes } from "./features/telegram-admin"
import { widgetRoutes } from "./features/widget"
import { widgetAdminRoutes } from "./features/widget-admin"
import type { RouteProps } from "./types"
import { knownTurnError } from "./types/errors"

export const app = new OpenAPIHono<RouteProps>()

// Whatever a route lets escape still answers in the `{ error }` JSON shape. Only logged here: in production the Sentry
// middleware reports every error a route throws (Hono records it before calling this), so reportError would double it.
app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  const known = knownTurnError(error)
  if (known) return c.json({ error: known.message }, known.status)
  console.error("Unhandled API error", { method: c.req.method, path: c.req.path, error })
  return c.json({ error: "Internal server error" }, 500)
})
app.notFound(c => c.json({ error: "Not found" }, 404))

// Global middlewares
if (env.NODE_ENV === "production") {
  app.use(
    sentry(app, {
      dsn: "https://bf4e285ce5108859b3a4e541ba9a8cab@o326475.ingest.us.sentry.io/4512041143828480",
      environment: "production",
      release: `kaja-api@${pkg.version}`
    })
  )
}
// /widget/turn and /widget/<key>.js are embedded on arbitrary third-party sites and have their own
// reflected-origin CORS (features/widget/cors.ts) — the app's single fixed CORS_ORIGIN can't apply
// there. /widget/admin/* is the authenticated management API and must go through the normal
// credentialed CORS below, so it's deliberately excluded from this exemption.
const PUBLIC_WIDGET_PATH = /^\/widget\/(turn|[A-Za-z0-9_-]+\.js)$/
app.use("*", (c, next) => {
  if (PUBLIC_WIDGET_PATH.test(c.req.path)) return next()
  return cors({ origin: env.CORS_ORIGIN, credentials: true })(c, next)
})
// No route takes more than a turn's text (images reach the API through Telegram, not request bodies); without this Bun buffers up to 128 MB before zod runs.
app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: c => c.json({ error: "Request body too large" }, 413) }))
app.use("*", globalRateLimiter)
app.use("*", csrfProtection)
app.use("*", authMiddleware)

// Mount routes
app.get("/favicon.ico", c => c.body(null, 204))
app.get("/", c => c.text("Hello, World!", 200))
app.get("/robots.txt", c => c.text("User-agent: *\nDisallow: /", 200))
app.use("/auth/*", authRateLimiter)
app.route("/admin", adminRoutes)
app.route("/auth", authRoutes)
app.route("/config", configExportRoutes)
app.route("/config", configRoutes)
app.route("/health", healthRoutes)
app.route("/nasi", nasiRoutes)
app.route("/abilities", abilityRoutes)
app.route("/sandbox", sandboxRoutes)
app.route("/stats", statsRoutes)
app.route("/telegram/admin", telegramAdminRoutes)
app.route("/widget", widgetRoutes)
app.route("/widget/admin", widgetAdminRoutes)

// API documentation
if (env.NODE_ENV === "development") {
  setupApiDocs(app)
  app.route("/reference", referenceRoutes)
}
