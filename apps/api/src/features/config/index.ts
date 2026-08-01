import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RouteProps } from "../../types"

/** Config routes (stub — add endpoints here). */
export const configRoutes = new OpenAPIHono<RouteProps>()

const testRoute = createRoute({
  method: "get",
  path: "/test",
  tags: ["Config"],
  summary: "Config test route",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            message: z.string().openapi({ example: "Config test route is working!" })
          })
        }
      }
    }
  }
})

configRoutes.openapi(testRoute, c => {
  return c.json({ message: "Config test route is working!" })
})
