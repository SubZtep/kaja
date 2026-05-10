import { zValidator } from "@hono/zod-validator"
import { spawnNodeRequestSchema, spawnNodeResponseSchema } from "@kaja/schemas"
import type { RouteRegProps } from "#/types"

export function registerSpawnNode(app: RouteRegProps) {
  app.post("/spawn-node", zValidator("json", spawnNodeRequestSchema), async c => {
    const body = c.req.valid("json")
    const nodeService = c.get("nodeService")

    const nodeId = body.nodeId || Bun.randomUUIDv7()

    await nodeService.spawnNode({
      id: nodeId,
      name: body.name
    })

    return c.json(
      spawnNodeResponseSchema.parse({
        nodeId,
        pollIntervalMs: 2000
      })
    )
  })
}
