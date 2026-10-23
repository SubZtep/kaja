import { createRoute, z } from "@hono/zod-openapi"
import { imageStatsSchema, statsQuerySchema } from "@kaja/schema/api"
import { statsService } from "../../services"
import type { RouteRegProps } from "../../types"

const errorSchema = z.object({ error: z.string() })

const userImagesRoute = createRoute({
  method: "get",
  path: "/users/{id}/images",
  tags: ["Admin"],
  summary: "A user's stored images: count, storage, descriptions, top sites and the chats holding the most",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.uuid() }), query: statsQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: imageStatsSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminImages(app: RouteRegProps) {
  app.openapi(userImagesRoute, async c => {
    const { id } = c.req.valid("param")
    const { days, tz } = c.req.valid("query")
    return c.json(await statsService.images(id, days, tz), 200)
  })
}
