import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  listCatalogResponseSchema,
  listUserPackagesResponseSchema,
  packageTypeSchema,
  savePackageKeyRequestSchema,
  savePackageKeyResponseSchema,
  skillDetailSchema
} from "@kaja/schema/api"
import { packageService } from "../../services"
import type { RouteVariables } from "../../types"
import { badRequest, notFound, serviceUnavailable, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"
import { nasiToolDeps } from "../nasi/chat"

const errorSchema = z.object({ error: z.string() })
const packageParams = z.object({
  type: packageTypeSchema.openapi({ param: { name: "type", in: "path" }, example: "skill" }),
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "system-report" })
})

/** /packages: the public cloud catalog (and each skill in full), and each signed-in user's own selections and keys under /packages/me. */
export const packageRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
packageRoutes.use("/me", requireAuthMiddleware)
packageRoutes.use("/me/*", requireAuthMiddleware)

const catalogRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Packages"],
  summary: "The cloud catalog: marketplace skills and HTTP tools anyone can enable",
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
  summary:
    "Packages the signed-in user enabled (ones that left the marketplace show as unavailable) and which have a saved key",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listUserPackagesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

packageRoutes.openapi(mineRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json({
    packages: await packageService.listForUser(user.id),
    keys: await packageService.keyNames(user.id),
    keysEnabled: packageService.keysEnabled
  })
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
    400: {
      description: "`key_required`: save the tool's key first",
      content: { "application/json": { schema: errorSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } }
  }
})

packageRoutes.openapi(enableRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { type, name } = c.req.valid("param")
  const result = await packageService.enable(user.id, type, name)
  if (result === "not_found") return notFound(c, "Package not found")
  if (result === "key_required") return badRequest(c, "key_required")
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

const toolParams = z.object({
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "open-meteo" })
})

const saveKeyRoute = createRoute({
  method: "put",
  path: "/me/tool/{name}/key",
  tags: ["Packages"],
  summary: "Save (or replace) the signed-in user's key for an HTTP tool, and test it",
  description:
    "Stored encrypted and never sent back. The key is tested with the package's `check` request; it's saved even when the test fails.",
  security: [{ bearerAuth: [] }],
  request: {
    params: toolParams,
    body: { content: { "application/json": { schema: savePackageKeyRequestSchema } }, required: true }
  },
  responses: {
    200: { description: "Saved", content: { "application/json": { schema: savePackageKeyResponseSchema } } },
    400: { description: "`no_key`: this tool takes no key", content: { "application/json": { schema: errorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } },
    503: {
      description: "`keys_unavailable`: the server can't store keys",
      content: { "application/json": { schema: errorSchema } }
    }
  }
})

packageRoutes.openapi(saveKeyRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  if (!packageService.keysEnabled) return serviceUnavailable(c, "keys_unavailable")
  const { name } = c.req.valid("param")
  // Same egress as a turn's tool calls: through WEB_PROXY when set, never to a private host.
  const result = await packageService.saveKey(user.id, name, c.req.valid("json").apiKey, {
    proxy: nasiToolDeps().fetchProxy
  })
  if (result === "not_found") return notFound(c, "Package not found")
  if (result === "no_key") return badRequest(c, "no_key")
  return c.json(result, 200)
})

const deleteKeyRoute = createRoute({
  method: "delete",
  path: "/me/tool/{name}/key",
  tags: ["Packages"],
  summary: "Remove the signed-in user's key for an HTTP tool (a tool that can't work without it is turned off too)",
  security: [{ bearerAuth: [] }],
  request: { params: toolParams },
  responses: {
    200: { description: "Removed", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such package", content: { "application/json": { schema: errorSchema } } }
  }
})

packageRoutes.openapi(deleteKeyRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  if (!(await packageService.deleteKey(user.id, c.req.valid("param").name))) return notFound(c, "Package not found")
  return c.json({ ok: true }, 200)
})
