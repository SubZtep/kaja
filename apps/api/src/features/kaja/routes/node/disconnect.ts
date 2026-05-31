import { createRoute } from "@hono/zod-openapi"
import { disconnectNodeRequestSchema } from "@kaja/schema"
import type { RouteRegProps } from "../../../../types"
import { unauthorized } from "../../../../types/errors"

const disconnectRoute = createRoute({
  method: "post",
  path: "/disconnect",
  tags: ["Nodes"],
  summary: "Disconnect a CLI node",
  description: "CLI node disconnects from the API",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: disconnectNodeRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Node disconnected successfully"
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } }
        }
      }
    }
  }
})

export function registerDisconnect(app: RouteRegProps) {
  app.openapi(disconnectRoute, async c => {
    const user = c.get("user")
    if (!user) {
      return unauthorized(c)
    }
    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")

    await nodeService.disconnectNode(body.nodeId!, user.id)

    return c.json({ success: true })
  })
}
