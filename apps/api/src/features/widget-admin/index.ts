import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  createWidgetKeyRequestSchema,
  createWidgetKeyResponseSchema,
  listWidgetKeysResponseSchema,
  updateWidgetKeyRequestSchema,
  type WidgetConfig,
  widgetKeySchema
} from "@kaja/schema/api"
import { abilityService, widgetService } from "../../services"
import type { RouteVariables } from "../../types"
import { badRequest, notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"

const errorSchema = z.object({ error: z.string() })
const idParam = z.object({
  id: z.uuidv7().openapi({ param: { name: "id", in: "path" } })
})

/** Why a config can't be saved (unknown persona or skills), or undefined when it's fine. */
async function configError(config: WidgetConfig | undefined): Promise<string | undefined> {
  if (config?.persona && !(await abilityService.personaCatalog()).some(p => p.id === config.persona)) {
    return `Unknown persona "${config.persona}"`
  }
  const unknownSkills = config?.skills ? await abilityService.unknownSkills(config.skills) : []
  if (unknownSkills.length > 0) return `Unknown skills: ${unknownSkills.join(", ")}`
  return undefined
}

export const widgetAdminRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
widgetAdminRoutes.use("*", requireAuthMiddleware)

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Widget"],
  summary: "List this account's widget keys",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listWidgetKeysResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(listRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const keys = await widgetService.listKeys(user.id)
  return c.json({ keys })
})

const createRouteDef = createRoute({
  method: "post",
  path: "/",
  tags: ["Widget"],
  summary: "Create a widget key — the raw key is returned once and never shown again",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createWidgetKeyRequestSchema } } }
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: createWidgetKeyResponseSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(createRouteDef, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { label, allowedOrigins, config } = c.req.valid("json")
  const invalid = await configError(config)
  if (invalid) return badRequest(c, invalid)
  const key = await widgetService.createKey(user.id, label, allowedOrigins, config)
  return c.json(key, 201)
})

const updateRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Widget"],
  summary: "Change a widget key's label, origins or config (persona, skills, widget type)",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updateWidgetKeyRequestSchema } } }
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: widgetKeySchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(updateRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { id } = c.req.valid("param")
  const patch = c.req.valid("json")
  const invalid = await configError(patch.config)
  if (invalid) return badRequest(c, invalid)
  const key = await widgetService.updateKey(user.id, id, patch)
  if (!key) return notFound(c, "Widget key not found")
  return c.json(key, 200)
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Widget"],
  summary: "Revoke a widget key",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Revoked", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: errorSchema } } }
  }
})

widgetAdminRoutes.openapi(deleteRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { id } = c.req.valid("param")
  const ok = await widgetService.revokeKey(user.id, id)
  if (!ok) return notFound(c, "Widget key not found")
  return c.json({ ok: true })
})
