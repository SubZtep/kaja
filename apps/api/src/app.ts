import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { trafficLogger } from "./core/logger"
import { authRateLimiter, globalRateLimiter } from "./core/rate-limit"
import { adminRoutes } from "./features/admin"
import { authMiddleware, authRoutes } from "./features/auth"
import { configRoutes } from "./features/config"
import { healthRoutes } from "./features/health"
import { nodeRoutes } from "./features/nodes"
import { referenceRoutes, setupApiDocs } from "./features/reference"
import { userRoutes } from "./features/users"
import type { RouteProps } from "./types"

export const app = new OpenAPIHono<RouteProps>()

// Global middlewares
app.use(logger(trafficLogger))
app.use("*", cors({ origin: process.env.CORS_ORIGIN, credentials: true }))
app.use("*", globalRateLimiter)
app.use("*", authMiddleware)

// Mount routes
app.get("/favicon.ico", c => c.body(null, 204))
app.get("/", c => c.text("Hello, World!", 200))
app.get("/robots.txt", c => c.text("User-agent: *\nDisallow: /", 200))
app.use("/auth/*", authRateLimiter)
app.route("/admin", adminRoutes)
app.route("/auth", authRoutes)
app.route("/config", configRoutes)
app.route("/health", healthRoutes)
app.route("/nodes", nodeRoutes)
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
