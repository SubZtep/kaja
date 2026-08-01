import { createRoute } from "@hono/zod-openapi"
import { heartbeatRequestSchema, heartbeatResponseSchema } from "@kaja/schema"
import type { RouteRegProps } from "../../types"
import { notFound, unauthorized } from "../../types/errors"

const NORMAL_POLL_INTERVAL = 60000 // 60 seconds
const FAST_POLL_INTERVAL = 5000 // 5 seconds

const heartbeatRoute = createRoute({
  method: "post",
  path: "/heartbeat",
  tags: ["Nodes"],
  summary: "Update node heartbeat",
  description: "Send heartbeat with node status and optionally receive pending commands",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: heartbeatRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Heartbeat accepted",
      content: {
        "application/json": {
          schema: heartbeatResponseSchema
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
    },
    404: {
      description: "Unknown node",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } }
        }
      }
    }
  }
})

export function registerHeartbeat(app: RouteRegProps) {
  app.openapi(heartbeatRoute, async c => {
    const user = c.get("user")
    if (!user) {
      return unauthorized(c)
    }

    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")
    const commandService = c.get("commandService")

    // Update node heartbeat
    const success = await nodeService.heartbeat(body.nodeId, user.id, body.status)

    if (!success) {
      return notFound(c, "Unknown node")
    }

    // Process command results from CLI
    if (body.commandResults && body.commandResults.length > 0) {
      for (const result of body.commandResults) {
        await commandService.updateCommandResult(result.commandId, result)
      }
    }

    // Get pending commands for this node
    const pendingCommands = await commandService.getPendingCommands(body.nodeId)

    // Mark pending commands as executing (picked up by CLI)
    for (const cmd of pendingCommands) {
      await commandService.markCommandExecuting(cmd.commandId)
    }

    // Determine poll interval: fast if there are pending commands, normal otherwise
    const hasPendingCommands = pendingCommands.length > 0
    const pollIntervalMs = hasPendingCommands ? FAST_POLL_INTERVAL : NORMAL_POLL_INTERVAL

    return c.json(
      heartbeatResponseSchema.parse({
        ok: true,
        pollIntervalMs,
        commands: pendingCommands.length > 0 ? pendingCommands : undefined
      })
    )
  })
}
