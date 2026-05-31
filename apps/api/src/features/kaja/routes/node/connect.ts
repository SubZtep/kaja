import { createRoute } from "@hono/zod-openapi"
import { connectNodeRequestSchema, connectNodeResponseSchema } from "@kaja/schemas"
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

    // const clientIp = getClientIp(c)
    // if (clientIp) {
    //   logger.info({ ip: clientIp, nodeId }, "Queueing GeoIP lookup")
    //   geoipQueue.add({ ip: clientIp, nodeId }).catch(error => {
    //     logger.error({ error, nodeId, ip: clientIp }, "Failed to queue GeoIP lookup")
    //   })
    //   logger.info({ ip: clientIp, nodeId }, "Queued GeoIP lookup")
    // } else {
    //   logger.warn({ nodeId }, "Could not get public IP address for GeoIP lookup")
    // }

    return c.json(
      connectNodeResponseSchema.parse({
        nodeId,
        pollIntervalMs: 2000
      })
    )
  })
}
