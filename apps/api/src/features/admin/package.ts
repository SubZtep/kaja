import { createRoute, z } from "@hono/zod-openapi"
import { marketplaceSyncResultSchema, marketplaceSyncStatusSchema } from "@kaja/schema/api"
import { marketplaceService } from "../../services"
import type { RouteRegProps } from "../../types"
import { badGateway } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })

const syncStatusRoute = createRoute({
  method: "get",
  path: "/packages/sync",
  tags: ["Admin"],
  summary: "Last marketplace sync: commit, time, and error if it failed",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: marketplaceSyncStatusSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const syncNowRoute = createRoute({
  method: "post",
  path: "/packages/sync",
  tags: ["Admin"],
  summary: "Sync the skill catalog from the marketplace repo now (skipped when the branch hasn't moved)",
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ force: z.enum(["true", "false"]).optional() }) },
  responses: {
    200: { description: "Synced", content: { "application/json": { schema: marketplaceSyncResultSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    502: { description: "GitHub or the tarball failed", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminPackages(app: RouteRegProps) {
  app.openapi(syncStatusRoute, async c => c.json(await marketplaceService.status(), 200))

  app.openapi(syncNowRoute, async c => {
    const { force } = c.req.valid("query")
    try {
      return c.json(await marketplaceService.sync({ force: force === "true" }), 200)
    } catch (error) {
      return badGateway(c, error instanceof Error ? error.message : String(error))
    }
  })
}
