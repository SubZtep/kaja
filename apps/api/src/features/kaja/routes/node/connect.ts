import { zValidator } from "@hono/zod-validator"
import { connectNodeRequestSchema, connectNodeResponseSchema } from "@kaja/schemas"
import type { RouteRegProps } from "#/types"

export function registerConnect(app: RouteRegProps) {
  app.post("/connect", zValidator("json", connectNodeRequestSchema), async c => {
    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")

    const nodeId = body.nodeId || Bun.randomUUIDv7()

    await nodeService.connectNode({
      id: nodeId,
      name: body.name
    })

    return c.json(
      connectNodeResponseSchema.parse({
        nodeId,
        pollIntervalMs: 2000
      })
    )
  })
}
