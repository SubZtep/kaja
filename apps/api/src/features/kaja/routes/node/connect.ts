import { createRoute } from "@hono/zod-openapi"
import { getClientIp } from "@kaja/geo"
import { connectNodeRequestSchema, connectNodeResponseSchema } from "@kaja/schemas"
import { logger } from "#/core/logger"
import { geoipQueue } from "#/core/queue"
import type { RouteRegProps } from "#/types"

const connectRoute = createRoute({
  method: "post",
  path: "/connect",
  tags: ["Nodes"],
  summary: "Connect a CLI node",
  description: "Register or reconnect a CLI node to the API",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: connectNodeRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Node connected successfully",
      content: {
        "application/json": {
          schema: connectNodeResponseSchema
        }
      }
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

export function registerConnect(app: RouteRegProps) {
  app.openapi(connectRoute, async c => {
    const user = c.get("user")
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401) as any
    }
    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")

    const nodeId = Bun.randomUUIDv7()

    await nodeService.connectNode({
      id: nodeId,
      userId: user.id,
      name: body.name
    })

    const clientIp = getClientIp(c)
    if (clientIp) {
      geoipQueue.add({ ip: clientIp, nodeId })
      logger.info({ ip: clientIp, nodeId }, "Queued GeoIP lookup")
    } else {
      logger.warn({ nodeId }, "Could not get public IP address for GeoIP lookup")
    }

    return c.json(
      connectNodeResponseSchema.parse({
        nodeId,
        pollIntervalMs: 2000
      })
    )
  })
}
