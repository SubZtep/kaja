import { createRoute, z } from "@hono/zod-openapi"
import {
  adminImagesQuerySchema,
  adminImagesResponseSchema,
  describeImageResponseSchema,
  describeImagesRequestSchema,
  describeImagesResponseSchema,
  imageOrphanKindSchema,
  imageOrphansResponseSchema,
  imageStatsSchema,
  removeOrphansResponseSchema,
  statsQuerySchema
} from "@kaja/schema/api"
import { errorSchema } from "../../core/errors"
import { imageService, statsService } from "../../services"
import { BadCursorError } from "../../services/image"
import type { RouteRegProps } from "../../types"
import { sessionUser } from "../auth"
import { cloudDescriber } from "../nasi/chat"

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

const imageParams = z.object({ sessionId: z.uuid(), id: z.string().regex(/^[0-9a-f]{16}$/) })
const noVision = { description: "No vision model is set up", content: { "application/json": { schema: errorSchema } } }

const describeImageRoute = createRoute({
  method: "post",
  path: "/images/{sessionId}/{id}/describe",
  tags: ["Admin"],
  summary: "Have the vision model describe one image now, however often it failed before",
  security: [{ bearerAuth: [] }],
  request: { params: imageParams },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: describeImageResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such image", content: { "application/json": { schema: errorSchema } } },
    409: noVision,
    502: { description: "The vision model failed", content: { "application/json": { schema: errorSchema } } }
  }
})

const describeImagesRoute = createRoute({
  method: "post",
  path: "/images/describe",
  tags: ["Admin"],
  summary: "Describe every undescribed image matching the filters, in the background",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: describeImagesRequestSchema } } } },
  responses: {
    200: { description: "Queued", content: { "application/json": { schema: describeImagesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    409: noVision
  }
})

const orphansRoute = createRoute({
  method: "get",
  path: "/images/orphans",
  tags: ["Admin"],
  summary: "Scan for objects without a row, rows without an object, and never-saved sessions' images",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: imageOrphansResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const removeOrphansRoute = createRoute({
  method: "delete",
  path: "/images/orphans/{kind}",
  tags: ["Admin"],
  summary: "Remove one kind of orphan, each checked again; anything younger than an hour stays",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ kind: imageOrphanKindSchema }) },
  responses: {
    200: { description: "Removed", content: { "application/json": { schema: removeOrphansResponseSchema } } },
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
  request: { params: imageParams },
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

  app.openapi(describeImageRoute, async c => {
    const { sessionId, id } = c.req.valid("param")
    const describer = await cloudDescriber()
    if (!describer) return c.json({ error: "No vision model is set up" }, 409)
    try {
      const description = await imageService.describe(sessionId, id, describer)
      if (description === undefined && !(await imageService.exists(sessionId, id)))
        return c.json({ error: "No such image" }, 404)
      return c.json({ description: description ?? null }, 200)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "The vision model failed" }, 502)
    }
  })

  app.openapi(describeImagesRoute, async c => {
    const describer = await cloudDescriber()
    if (!describer) return c.json({ error: "No vision model is set up" }, 409)
    return c.json({ queued: await imageService.describeMatching(c.req.valid("json"), describer) }, 200)
  })

  // Before the image routes: "orphans" would otherwise be read as a session id
  app.openapi(orphansRoute, async c => c.json(await imageService.orphans(), 200))

  app.openapi(removeOrphansRoute, async c => {
    const { kind } = c.req.valid("param")
    const removed = await imageService.removeOrphans(kind)
    console.info("Admin removed orphan images", { admin: sessionUser(c).id, kind, removed })
    return c.json({ removed }, 200)
  })

  app.openapi(deleteImageRoute, async c => {
    const { sessionId, id } = c.req.valid("param")
    const removed = await imageService.remove(sessionId, id)
    if (!removed) return c.json({ error: "No such image" }, 404)
    console.info("Admin removed an image", { admin: sessionUser(c).id, user: removed.userId, sessionId, id })
    return c.json({ ok: true }, 200)
  })
}
