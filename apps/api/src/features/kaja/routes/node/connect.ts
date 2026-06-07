import { createRoute } from "@hono/zod-openapi"
import { error, info, warn } from "@kaja/logger"
import { connectNodeRequestSchema, connectNodeResponseSchema } from "@kaja/schema"
import { getClientIp, getGeoLocation } from "../../../../lib/geo-client"
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
      // Call geo-service directly (it handles queueing internally)
      // Run async without blocking the response
      ;(async () => {
        try {
          info("Starting GeoIP lookup", { ip: clientIp, nodeId })
          const location = await getGeoLocation(clientIp)
          info("Got location data", { nodeId, location })

          if (location) {
            info("Updating node geo_location", { nodeId })
            const result = await nodeService.updateGeoLocation(nodeId, location)
            info("Database update result", { nodeId, result })
          } else {
            warn("No location data returned - GeoIP database may be missing", { nodeId, ip: clientIp })
          }

          info("GeoIP job completed", { nodeId, location })
        } catch (err) {
          error("GeoIP job failed", { error: err, nodeId, ip: clientIp })
        }
      })()
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
