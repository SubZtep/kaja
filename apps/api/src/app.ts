import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { healthRoutes } from "#/core/routes/health"
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
  app.get("/reference", swaggerUI({ url: "/openapi.json" }))
  app.doc("/openapi.json", {
    openapi: "3.1.1",
    info: {
      title: "Kaja.io API",
      version: "0.0.1",
      description: "Custom endpoints without [auth reference](/auth/reference)."
    }
  })  
}

// Run server
export default {
  port: Number(process.env.PORT),
  fetch: app.fetch
}
