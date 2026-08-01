import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RouteVariables } from "../../types"

export const healthRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()

const healthRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["System"],
  summary: "API health check",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            status: z.string().openapi({ example: "ok" })
          })
        }
      }
    }
  }
})

healthRoutes.openapi(healthRoute, c => {
  return c.json({ status: "ok" })
})
