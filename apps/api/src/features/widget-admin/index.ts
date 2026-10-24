import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  createWidgetRequestSchema,
  createWidgetResponseSchema,
  listWidgetsResponseSchema,
  updateWidgetRequestSchema,
  widgetLinkRequestSchema,
  widgetSchema
} from "@kaja/schema/api"
import { modelService, widgetService } from "../../services"
import type { RouteVariables } from "../../types"
import { badRequest, notFound } from "../../types/errors"
import { requireAuthMiddleware, sessionUser } from "../auth"
import { generateDraft, regenerateAffected } from "../widget/generate"

const errorSchema = z.object({ error: z.string() })
const idParam = z.object({
  id: z.uuidv7().openapi({ param: { name: "id", in: "path" } })
})

async function unknownModel(model: string | undefined): Promise<string | undefined> {
  if (!model) return undefined
  const found = await modelService.getModelWithProviderByName(model)
  return found ? undefined : `Unknown model "${model}"`
}

export const widgetAdminRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
widgetAdminRoutes.use("*", requireAuthMiddleware)

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Widget"],
  summary: "List this account's widgets",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listWidgetsResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(listRoute, async c => {
  const widgets = await widgetService.list(sessionUser(c).id)
  return c.json({ widgets }, 200)
})

const createRouteDef = createRoute({
  method: "post",
  path: "/",
  tags: ["Widget"],
  summary: "Create a widget — the raw token is returned once",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: createWidgetRequestSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: createWidgetResponseSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(createRouteDef, async c => {
  const user = sessionUser(c)
  const body = c.req.valid("json")
  const invalid = await unknownModel(body.model)
  if (invalid) return badRequest(c, invalid)
  const created = await widgetService.create(user.id, body)
  const drafted = await generateDraft(user.id, created.id, true)
  return c.json({ ...(drafted ?? created), rawToken: created.rawToken }, 201)
})

const updateRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Widget"],
  summary: "Change a widget's label, intent, model, or target",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updateWidgetRequestSchema } } }
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: widgetSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(updateRoute, async c => {
  const user = sessionUser(c)
  const { id } = c.req.valid("param")
  const patch = c.req.valid("json")
  const invalid = await unknownModel(patch.model)
  if (invalid) return badRequest(c, invalid)
  const updated = await widgetService.update(user.id, id, patch)
  if (!updated) return notFound(c, "Widget not found")
  if (!updated.behaviorChanged) return c.json(updated.widget, 200)
  await regenerateAffected(user.id, id)
  const widget = await widgetService.get(user.id, id)
  return c.json(widget ?? updated.widget, 200)
})

const linkRoute = createRoute({
  method: "post",
  path: "/{id}/links",
  tags: ["Widget"],
  summary: "Link this widget to another the account owns",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: widgetLinkRequestSchema } } }
  },
  responses: {
    200: { description: "Linked", content: { "application/json": { schema: widgetSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(linkRoute, async c => {
  const user = sessionUser(c)
  const { id } = c.req.valid("param")
  const { to } = c.req.valid("json")
  const linked = await widgetService.link(user.id, id, to)
  if (linked === null) return notFound(c, "Widget not found")
  if (linked) {
    await generateDraft(user.id, id, true)
    await generateDraft(user.id, to, true)
  }
  const widget = await widgetService.get(user.id, id)
  if (!widget) return notFound(c, "Widget not found")
  return c.json(widget, 200)
})

const unlinkRoute = createRoute({
  method: "delete",
  path: "/{id}/links/{to}",
  tags: ["Widget"],
  summary: "Remove a link from this widget",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      id: z.uuidv7().openapi({ param: { name: "id", in: "path" } }),
      to: z.uuidv7().openapi({ param: { name: "to", in: "path" } })
    })
  },
  responses: {
    200: { description: "Unlinked", content: { "application/json": { schema: widgetSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(unlinkRoute, async c => {
  const user = sessionUser(c)
  const { id, to } = c.req.valid("param")
  const removed = await widgetService.unlink(user.id, id, to)
  if (removed === null) return notFound(c, "Widget not found")
  if (removed) await generateDraft(user.id, id, true)
  const widget = await widgetService.get(user.id, id)
  if (!widget) return notFound(c, "Widget not found")
  return c.json(widget, 200)
})

const generateRoute = createRoute({
  method: "post",
  path: "/{id}/generate",
  tags: ["Widget"],
  summary: "Write a new draft from the widget's intent",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Draft stored", content: { "application/json": { schema: widgetSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(generateRoute, async c => {
  const user = sessionUser(c)
  const widget = await generateDraft(user.id, c.req.valid("param").id, true)
  if (!widget) return notFound(c, "Widget not found")
  return c.json(widget, 200)
})

const publishRoute = createRoute({
  method: "post",
  path: "/{id}/publish",
  tags: ["Widget"],
  summary: "Publish the current draft",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Published", content: { "application/json": { schema: widgetSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(publishRoute, async c => {
  const user = sessionUser(c)
  const widget = await widgetService.publish(user.id, c.req.valid("param").id)
  if (!widget) return notFound(c, "Widget not found")
  return c.json(widget, 200)
})

const discardRoute = createRoute({
  method: "delete",
  path: "/{id}/draft",
  tags: ["Widget"],
  summary: "Discard the current draft",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Discarded", content: { "application/json": { schema: widgetSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(discardRoute, async c => {
  const user = sessionUser(c)
  const widget = await widgetService.discardDraft(user.id, c.req.valid("param").id)
  if (!widget) return notFound(c, "Widget not found")
  return c.json(widget, 200)
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Widget"],
  summary: "Revoke a widget",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Revoked", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(deleteRoute, async c => {
  const user = sessionUser(c)
  const ok = await widgetService.revoke(user.id, c.req.valid("param").id)
  if (!ok) return notFound(c, "Widget not found")
  return c.json({ ok: true }, 200)
})
