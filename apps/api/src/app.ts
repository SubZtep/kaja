import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { healthRoutes } from "#/core/routes/health"
import { referenceRoutes, setupApiDocs } from "#/core/routes/reference"
import { userRoutes } from "#/core/routes/user"
import { authMiddleware, authRoutes } from "#/features/auth"
import { kajaRoutes } from "#/features/kaja"
import type { RouteProps } from "#/types"

export const app = new OpenAPIHono<RouteProps>()

// CORS
app.use("*", cors({ origin: process.env.CORS_ORIGIN, credentials: true }))

// Attach auth middleware
app.use("*", authMiddleware)

// Mount routes
app.route("/health", healthRoutes)
app.route("/auth", authRoutes)
app.route("/kaja", kajaRoutes)
app.route("/users", userRoutes)

// API documentation
if (process.env.NODE_ENV === "development") {
  setupApiDocs(app)
  app.route("/reference", referenceRoutes)
}

// Run server
export default {
  port: Number(process.env.PORT),
  fetch: app.fetch
}
