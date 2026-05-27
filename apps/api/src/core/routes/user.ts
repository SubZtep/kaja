import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { RouteVariables } from "#/types"

export const userRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()

const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Users"],
  summary: "Current user profile",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Authenticated user",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().openapi({ example: "01945678-1234-7abc-9def-0123456789ab" }),
            email: z.string().email().openapi({ example: "user@example.com" })
          })
        }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string()
          })
        }
      }
    }
  }
})

userRoutes.openapi(getMeRoute, c => {
  const user = c.get("user")
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401) as any
  }

  return c.json({ id: user.id, email: user.email })
})
