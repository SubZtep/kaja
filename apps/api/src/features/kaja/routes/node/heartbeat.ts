import { zValidator } from "@hono/zod-validator"
import { heartbeatRequestSchema, heartbeatResponseSchema } from "@kaja/schemas"
import type { RouteRegProps } from "#/types"

export function registerHeartbeat(app: RouteRegProps) {
  app.post("/heartbeat", zValidator("json", heartbeatRequestSchema), async c => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")

    const success = await nodeService.heartbeat(body.nodeId, user.id, body.status)

    if (!success) {
      return c.json({ error: "unknown node" }, 404)
    }

    return c.json(heartbeatResponseSchema.parse({ ok: true }))
  })
}
