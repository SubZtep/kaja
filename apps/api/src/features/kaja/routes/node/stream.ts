import { streamSSE } from "hono/streaming"
import { logger } from "../../../../core/logger"
import type { RouteRegProps } from "../../../../types"
import type { NodeEvent } from "../../services/events"
import { nodeEvents } from "../../services/events"

/**
 * SSE endpoint for real-time node status updates.
 * Streams updates only for nodes owned by the authenticated user.
 */
export function registerStream(app: RouteRegProps) {
  app.get("/stream", async c => {
    const user = c.get("user")
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const userId = user.id

    return streamSSE(c, async stream => {
      logger.info({ userId }, "SSE client connected")

      // Send initial connection event
      await stream.writeSSE({
        data: JSON.stringify({ type: "connected" }),
        event: "node-update"
      })

      // Listen for node events and filter by userId
      const eventHandler = async (event: NodeEvent) => {
        // Only send events for nodes owned by this user
        if (event.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: event.type,
              node: {
                id: event.node.id,
                userId: event.node.userId,
                name: event.node.name,
                lastSeen: event.node.lastSeen.toISOString(),
                status: event.node.status
              }
            }),
            event: "node-update"
          })
        }
      }

      nodeEvents.on("node-update", eventHandler)

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ type: "ping" }),
          event: "ping"
        })
      }, 30000) // Every 30 seconds

      // Cleanup on disconnect
      stream.onAbort(() => {
        logger.info({ userId }, "SSE client disconnected")
        nodeEvents.off("node-update", eventHandler)
        clearInterval(pingInterval)
      })

      // Keep the stream open indefinitely using a loop instead of MAX_SAFE_INTEGER
      // This prevents Bun's timeout overflow warning
      while (true) {
        await stream.sleep(30000)
      }
    })
  })
}
