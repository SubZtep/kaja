import { swaggerUI } from "@hono/swagger-ui"
import { OpenAPIHono } from "@hono/zod-openapi"
import type { RouteProps } from "#/types"

export const referenceRoutes = new OpenAPIHono<RouteProps>()

// API documentation UI
if (process.env.NODE_ENV === "development") {
  referenceRoutes.get("/", swaggerUI({ url: "/reference/openapi.json" }))
}

// Setup OpenAPI documentation schema on the main app
export function setupApiDocs(app: OpenAPIHono<RouteProps>) {
  if (process.env.NODE_ENV === "development") {
    app.doc("/reference/openapi.json", {
      openapi: "3.1.1",
      info: {
        title: "Kaja.io API",
        version: "0.0.1",
        description: "Custom endpoints reference. [Click here](/auth/reference) for auth endpoints."
      }
    })
  }
}
