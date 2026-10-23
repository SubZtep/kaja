import { createRoute, z } from "@hono/zod-openapi"
import { adminImagesQuerySchema, adminImagesResponseSchema, imageStatsSchema, statsQuerySchema } from "@kaja/schema/api"
import { imageService, statsService } from "../../services"
import { BadCursorError } from "../../services/image"
import type { RouteRegProps } from "../../types"
import { sessionUser } from "../auth"

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

const listImagesRoute = createRoute({
  method: "get",
  path: "/images",
  tags: ["Admin"],
  summary: "Stored images across users, newest first, filtered by user, source site, description and origin",
  security: [{ bearerAuth: [] }],
  request: { query: adminImagesQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: adminImagesResponseSchema } } },
    400: { description: "Not a cursor from this list", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const deleteImageRoute = createRoute({
  method: "delete",
  path: "/images/{sessionId}/{id}",
  tags: ["Admin"],
  summary: "Remove one stored image; its messages then read it as no longer stored",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ sessionId: z.uuid(), id: z.string().regex(/^[0-9a-f]{16}$/) }) },
  responses: {
    200: { description: "Removed", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such image", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminImages(app: RouteRegProps) {
  app.openapi(userImagesRoute, async c => {
    const { id } = c.req.valid("param")
    const { days, tz } = c.req.valid("query")
    return c.json(await statsService.images(id, days, tz), 200)
  })

  app.openapi(listImagesRoute, async c => {
    try {
      return c.json(await imageService.list(c.req.valid("query")), 200)
    } catch (error) {
      if (error instanceof BadCursorError) return c.json({ error: error.message }, 400)
      throw error
    }
  })

  app.openapi(deleteImageRoute, async c => {
    const { sessionId, id } = c.req.valid("param")
    const removed = await imageService.remove(sessionId, id)
    if (!removed) return c.json({ error: "No such image" }, 404)
    console.info("Admin removed an image", { admin: sessionUser(c).id, user: removed.userId, sessionId, id })
    return c.json({ ok: true }, 200)
  })
}
