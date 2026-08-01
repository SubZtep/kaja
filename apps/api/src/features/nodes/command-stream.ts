import { info } from "@kaja/logger"
import { streamSSE } from "hono/streaming"
import type { CommandEvent } from "../../services/events"
import { commandEvents } from "../../services/events"
import type { RouteRegProps } from "../../types"

/**
 * SSE endpoint for CLI nodes to receive commands in real-time.
 * Pushes commands to the node immediately when created.
 */
export function registerCommandStream(app: RouteRegProps) {
  app.get("/:id/commands/stream", async c => {
    const user = c.get("user")
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const nodeId = c.req.param("id")
    const userId = user.id

    return streamSSE(c, async stream => {
      info("CLI command stream connected", { nodeId, userId })

      // Send initial connection event
      await stream.writeSSE({
        data: JSON.stringify({ type: "connected" }),
        event: "command-update"
      })

      // Listen for command events for this specific node
      const eventHandler = async (event: CommandEvent) => {
        // Only send commands for this node
        if (event.nodeId === nodeId) {
          try {
            await stream.writeSSE({
              data: JSON.stringify({
                type: event.type,
                command: {
                  id: event.command.id,
                  nodeId: event.command.nodeId,
                  command: event.command.command,
                  args: event.command.args,
                  timeoutSeconds: event.command.timeoutSeconds,
                  status: event.command.status,
                  createdAt: event.command.createdAt.toISOString()
                }
              }),
              event: "command-update"
            })
          } catch (err) {
            info("Failed to send command SSE event", {
              error: err,
              eventType: event.type,
              commandId: event.command.id
            })
          }
        }
      }

      commandEvents.on("command-update", eventHandler)

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ type: "ping" }),
          event: "ping"
        })
      }, 30000) // Every 30 seconds

      // Cleanup on disconnect
      stream.onAbort(() => {
        info("CLI command stream disconnected", { nodeId, userId })
        commandEvents.off("command-update", eventHandler)
        clearInterval(pingInterval)
      })

      // Keep the stream open indefinitely
      while (true) {
        await stream.sleep(30000)
      }
    })
  })
}
