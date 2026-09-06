import { OpenAPIHono } from "@hono/zod-openapi"
import { sentry } from "@sentry/hono/bun"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { env } from "./core/env"
import { trafficLogger } from "./core/logger"
import { authRateLimiter, globalRateLimiter } from "./core/rate-limit"
import { adminRoutes } from "./features/admin"
import { authMiddleware, authRoutes } from "./features/auth"
import { configRoutes } from "./features/config"
import { healthRoutes } from "./features/health"
import { nasiRoutes } from "./features/nasi"
import { referenceRoutes, setupApiDocs } from "./features/reference"
import { userRoutes } from "./features/users"
import { widgetRoutes } from "./features/widget"
import { widgetKeyRoutes } from "./features/widget-key"
import type { RouteProps } from "./types"

export const app = new OpenAPIHono<RouteProps>()

// Global middlewares
if (env.NODE_ENV === "production") {
  app.use(
    sentry(app, {
      dsn: "https://bf4e285ce5108859b3a4e541ba9a8cab@o326475.ingest.us.sentry.io/4512041143828480",
      environment: "production"
    })
  )
}
app.use(logger(trafficLogger))
// /widget/* is embedded on arbitrary third-party sites and has its own reflected-origin CORS
// (features/widget/cors.ts) — the app's single fixed CORS_ORIGIN can't apply there.
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/widget/")) return next()
  return cors({ origin: env.CORS_ORIGIN, credentials: true })(c, next)
})
app.use("*", globalRateLimiter)
app.use("*", authMiddleware)

// Mount routes
app.get("/favicon.ico", c => c.body(null, 204))
app.get("/", c => c.text("Hello, World!", 200))
app.get("/robots.txt", c => c.text("User-agent: *\nDisallow: /", 200))
app.get("/sentry-example", () => {
  throw new Error("Sentry Example API Error")
})
app.use("/auth/*", authRateLimiter)
app.route("/admin", adminRoutes)
app.route("/auth", authRoutes)
app.route("/config", configRoutes)
app.route("/health", healthRoutes)
app.route("/nasi", nasiRoutes)
app.route("/users", userRoutes)
app.route("/widget", widgetRoutes)
app.route("/widget-keys", widgetKeyRoutes)

// API documentation
if (env.NODE_ENV === "development") {
  setupApiDocs(app)
  app.route("/reference", referenceRoutes)
}

// Run server
export default {
  port: env.PORT,
  idleTimeout: 30,
  fetch: app.fetch
}
