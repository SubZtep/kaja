import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { trafficLogger } from "./core/logger"
import { authRateLimiter } from "./core/rate-limit"
import { healthRoutes } from "./core/routes/health"
import { referenceRoutes, setupApiDocs } from "./core/routes/reference"
import { userRoutes } from "./core/routes/user"
import { authMiddleware, authRoutes } from "./features/auth"
import { adminRoutes, nodeRoutes } from "./features/kaja"
import type { RouteProps } from "./types"

export const app = new OpenAPIHono<RouteProps>()

// Global middlewares
app.use(logger(trafficLogger))
app.use("*", cors({ origin: process.env.CORS_ORIGIN, credentials: true }))
// app.use("*", globalRateLimiter)
app.use("*", authMiddleware)

// Mount routes
app.route("/health", healthRoutes)
app.use("/auth/*", authRateLimiter) // Stricter rate limit for auth endpoints
app.route("/auth", authRoutes)
app.route("/nodes", nodeRoutes)
app.route("/admin", adminRoutes)
app.route("/users", userRoutes)

// API documentation
if (process.env.NODE_ENV === "development") {
  setupApiDocs(app)
  app.route("/reference", referenceRoutes)
}

// Run server
export default {
  port: Number(process.env.PORT || 3001),
  idleTimeout: 30,
  fetch: app.fetch
}
