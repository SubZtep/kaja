import { createRoute, z } from "@hono/zod-openapi"
import type { RouteRegProps } from "#/types"
import { unauthorized } from "#/types/errors"

const listNodesRoute = createRoute({
  method: "get",
  path: "/nodes",
  tags: ["Nodes"],
  summary: "List active nodes",
  description: "Get all active nodes for the authenticated user",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "List of active nodes",
      content: {
        "application/json": {
          schema: z.object({
            nodes: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                status: z.enum(["idle", "busy", "inactive"]),
                lastSeen: z.string()
              })
            )
          })
        }
      }
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
})

export function registerList(app: RouteRegProps) {
  app.openapi(listNodesRoute, async c => {
    const user = c.get("user")
    if (!user) {
      return unauthorized(c)
    }

    const nodeService = c.get("nodeService")
    const nodes = await nodeService.getActiveNodes(user.id)

    return c.json({ nodes })
  })
}
