import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  abilityTypeSchema,
  DEFAULT_PERSONA,
  listCatalogResponseSchema,
  listUserAbilitiesResponseSchema,
  skillDetailSchema
} from "@kaja/schema/api"
import { abilityService } from "../../services"
import type { RouteVariables } from "../../types"
import { badRequest, notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"

const errorSchema = z.object({ error: z.string() })
const ALWAYS_ON = "The default persona is always on"
const isDefaultPersona = (type: string, name: string) => type === "persona" && name === DEFAULT_PERSONA
const abilityParams = z.object({
  type: abilityTypeSchema.openapi({ param: { name: "type", in: "path" }, example: "skill" }),
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "system-report" })
})

/** /abilities: the public cloud catalog (and each skill in full), and each signed-in user's own selections under /abilities/me. */
export const abilityRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
abilityRoutes.use("/me", requireAuthMiddleware)
abilityRoutes.use("/me/*", requireAuthMiddleware)

const catalogRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Abilities"],
  summary: "The cloud catalog: marketplace skills, personas, HTTP tools and MCP servers anyone can enable",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listCatalogResponseSchema } } }
  }
})

abilityRoutes.openapi(catalogRoute, async c => c.json({ abilities: await abilityService.listCatalog() }))

const skillRoute = createRoute({
  method: "get",
  path: "/skill/{name}",
  tags: ["Abilities"],
  summary: "One catalog skill in full: its instructions and other files",
  request: {
    params: z.object({
      name: z
        .string()
        .min(1)
        .openapi({ param: { name: "name", in: "path" } })
    })
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: skillDetailSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(skillRoute, async c => {
  const skill = await abilityService.getSkill(c.req.valid("param").name)
  if (!skill) return notFound(c, "Skill not found")
  return c.json(skill, 200)
})

const mineRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Abilities"],
  summary: "Abilities the signed-in user enabled (ones that left the marketplace show as unavailable)",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listUserAbilitiesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(mineRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json({ abilities: await abilityService.listForUser(user.id) })
})

const enableRoute = createRoute({
  method: "put",
  path: "/me/{type}/{name}",
  tags: ["Abilities"],
  summary: "Enable a catalog ability for the signed-in user",
  security: [{ bearerAuth: [] }],
  request: { params: abilityParams },
  responses: {
    200: { description: "Enabled", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    400: {
      description: "The default persona, which is always on",
      content: { "application/json": { schema: errorSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(enableRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { type, name } = c.req.valid("param")
  if (isDefaultPersona(type, name)) return badRequest(c, ALWAYS_ON)
  const result = await abilityService.enable(user.id, type, name)
  if (result === "not_found") return notFound(c, "Ability not found")
  return c.json({ ok: true })
})

const disableRoute = createRoute({
  method: "delete",
  path: "/me/{type}/{name}",
  tags: ["Abilities"],
  summary: "Disable an ability for the signed-in user",
  security: [{ bearerAuth: [] }],
  request: { params: abilityParams },
  responses: {
    200: { description: "Disabled", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    400: {
      description: "The default persona, which is always on",
      content: { "application/json": { schema: errorSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such ability", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(disableRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { type, name } = c.req.valid("param")
  if (isDefaultPersona(type, name)) return badRequest(c, ALWAYS_ON)
  if (!(await abilityService.disable(user.id, type, name))) return notFound(c, "Ability not found")
  return c.json({ ok: true })
})
