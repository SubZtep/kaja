import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  listCatalogResponseSchema,
  listUserPackagesResponseSchema,
  packageTypeSchema,
  skillDetailSchema
} from "@kaja/schema/api"
import { packageService } from "../../services"
import type { RouteVariables } from "../../types"
import { notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"

const errorSchema = z.object({ error: z.string() })
const packageParams = z.object({
  type: packageTypeSchema.openapi({ param: { name: "type", in: "path" }, example: "skill" }),
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "system-report" })
})

/** /packages: the public cloud catalog (and each skill in full), and each signed-in user's own selections under /packages/me. */
export const packageRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
packageRoutes.use("/me", requireAuthMiddleware)
packageRoutes.use("/me/*", requireAuthMiddleware)

const catalogRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Packages"],
  summary: "The cloud catalog: marketplace skills anyone can enable",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listCatalogResponseSchema } } }
  }
})

packageRoutes.openapi(catalogRoute, async c => c.json({ packages: await packageService.listCatalog() }))

const skillRoute = createRoute({
  method: "get",
  path: "/skill/{name}",
  tags: ["Packages"],
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

packageRoutes.openapi(skillRoute, async c => {
  const skill = await packageService.getSkill(c.req.valid("param").name)
  if (!skill) return notFound(c, "Skill not found")
  return c.json(skill, 200)
})

const mineRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Packages"],
  summary: "Packages the signed-in user enabled (ones that left the marketplace show as unavailable)",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listUserPackagesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

packageRoutes.openapi(mineRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json({ packages: await packageService.listForUser(user.id) })
})

const enableRoute = createRoute({
  method: "put",
  path: "/me/{type}/{name}",
  tags: ["Packages"],
  summary: "Enable a catalog package for the signed-in user",
  security: [{ bearerAuth: [] }],
  request: { params: packageParams },
  responses: {
    200: { description: "Enabled", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } }
  }
})

packageRoutes.openapi(enableRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { type, name } = c.req.valid("param")
  if (!(await packageService.enable(user.id, type, name))) return notFound(c, "Package not found")
  return c.json({ ok: true })
})

const disableRoute = createRoute({
  method: "delete",
  path: "/me/{type}/{name}",
  tags: ["Packages"],
  summary: "Disable a package for the signed-in user",
  security: [{ bearerAuth: [] }],
  request: { params: packageParams },
  responses: {
    200: { description: "Disabled", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such package", content: { "application/json": { schema: errorSchema } } }
  }
})

packageRoutes.openapi(disableRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { type, name } = c.req.valid("param")
  if (!(await packageService.disable(user.id, type, name))) return notFound(c, "Package not found")
  return c.json({ ok: true })
})
