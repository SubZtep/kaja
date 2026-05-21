import { zValidator } from "@hono/zod-validator"
import { heartbeatRequestSchema, heartbeatResponseSchema } from "@kaja/schemas"
import type { RouteRegProps } from "#/types"

const NORMAL_POLL_INTERVAL = 60000 // 60 seconds
const FAST_POLL_INTERVAL = 5000 // 5 seconds

export function registerHeartbeat(app: RouteRegProps) {
  app.post("/heartbeat", zValidator("json", heartbeatRequestSchema), async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")
    const commandService = c.get("commandService")

    // Update node heartbeat
    const success = await nodeService.heartbeat(body.nodeId, user.id, body.status)

    if (!success) {
      return c.json({ error: "unknown node" }, 404)
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
