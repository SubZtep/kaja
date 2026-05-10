import { swaggerUI } from "@hono/swagger-ui"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { healthRoutes } from "#/core/routes/health"
import { userRoutes } from "#/core/routes/user"
import { authMiddleware, authRoutes } from "#/features/auth"
import { kajaRoutes } from "#/features/kaja"
import type { RouteProps } from "#/types"

export const app = new Hono<RouteProps>()

// CORS
app.use("*", cors({ origin: process.env.CORS_ORIGIN, credentials: true }))

// Attach auth middleware
app.use("*", authMiddleware)

if (process.env.NODE_ENV === "development") {
  const openApiPath = new URL("../openapi.json", import.meta.url)
  app.get("/openapi.json", async c => c.json(await Bun.file(openApiPath).json()))
  app.get("/reference", swaggerUI({ url: "/openapi.json" }))
}

// Mount routes
app.route("/health", healthRoutes)
app.route("/auth", authRoutes)
app.route("/kaja", kajaRoutes)
app.route("/users", userRoutes)

// Run server
export default {
  port: Number(process.env.PORT),
  fetch: app.fetch
}
