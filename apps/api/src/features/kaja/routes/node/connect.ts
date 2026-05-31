import { createRoute } from "@hono/zod-openapi"
import { getClientIp } from "@kaja/geo"
import { error, info, warn } from "@kaja/logger"
import { connectNodeRequestSchema, connectNodeResponseSchema } from "@kaja/schema"
import { geoipQueue } from "../../../../core/queue"
import type { RouteRegProps } from "../../../../types"
import { unauthorized } from "../../../../types/errors"

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
      return unauthorized(c)
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
      info("Queueing GeoIP lookup", { ip: clientIp, nodeId })
      geoipQueue.add({ ip: clientIp, nodeId }).catch(err => {
        error("Failed to queue GeoIP lookup", { error: err, nodeId, ip: clientIp })
      })
      info("Queued GeoIP lookup", { ip: clientIp, nodeId })
    } else {
      warn("Could not get public IP address for GeoIP lookup", { nodeId })
    }

    return c.json(
      connectNodeResponseSchema.parse({
        nodeId,
        pollIntervalMs: 2000
      })
    )
  })
}
