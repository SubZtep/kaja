import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  abilityTypeSchema,
  DEFAULT_PERSONA,
  keyedAbilityTypeSchema,
  listCatalogResponseSchema,
  listUserAbilitiesResponseSchema,
  saveAbilityKeyRequestSchema,
  saveAbilityKeyResponseSchema,
  skillDetailSchema
} from "@kaja/schema/api"
import { abilityService } from "../../services"
import type { RouteVariables } from "../../types"
import { badRequest, notFound, serviceUnavailable, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"
import { nasiToolDeps } from "../nasi/chat"

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

/** /abilities: the public cloud catalog (and each skill in full), and each signed-in user's own selections and keys under /abilities/me. */
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
  summary:
    "Abilities the signed-in user enabled (ones that left the marketplace show as unavailable) and which have a saved key",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listUserAbilitiesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(mineRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json({
    abilities: await abilityService.listForUser(user.id),
    keys: await abilityService.keyNames(user.id),
    keysEnabled: abilityService.keysEnabled
  })
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
      description: "`key_required`: save the tool's key first; or the default persona, which is always on",
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
  if (result === "key_required") return badRequest(c, "key_required")
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

const keyParams = z.object({
  type: keyedAbilityTypeSchema.openapi({ param: { name: "type", in: "path" }, example: "tool" }),
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "open-meteo" })
})

const saveKeyRoute = createRoute({
  method: "put",
  path: "/me/{type}/{name}/key",
  tags: ["Abilities"],
  summary: "Save (or replace) the signed-in user's key for an HTTP tool or MCP server, and test it",
  description:
    "Stored encrypted and never sent back. A tool's key is tested with its `check` request, an MCP server's by connecting and listing its tools; the key is saved even when the test fails.",
  security: [{ bearerAuth: [] }],
  request: {
    params: keyParams,
    body: { content: { "application/json": { schema: saveAbilityKeyRequestSchema } }, required: true }
  },
  responses: {
    200: { description: "Saved", content: { "application/json": { schema: saveAbilityKeyResponseSchema } } },
    400: {
      description: "`no_key`: this ability takes no key",
      content: { "application/json": { schema: errorSchema } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } },
    503: {
      description: "`keys_unavailable`: the server can't store keys",
      content: { "application/json": { schema: errorSchema } }
    }
  }
})

abilityRoutes.openapi(saveKeyRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  if (!abilityService.keysEnabled) return serviceUnavailable(c, "keys_unavailable")
  const { type, name } = c.req.valid("param")
  // Same egress as a turn's tool calls: through WEB_PROXY when set, never to a private host.
  const result = await abilityService.saveKey(user.id, type, name, c.req.valid("json").apiKey, {
    proxy: nasiToolDeps().fetchProxy
  })
  if (result === "not_found") return notFound(c, "Ability not found")
  if (result === "no_key") return badRequest(c, "no_key")
  return c.json(result, 200)
})

const deleteKeyRoute = createRoute({
  method: "delete",
  path: "/me/{type}/{name}/key",
  tags: ["Abilities"],
  summary:
    "Remove the signed-in user's key for an HTTP tool or MCP server (one that can't work without it is turned off too)",
  security: [{ bearerAuth: [] }],
  request: { params: keyParams },
  responses: {
    200: { description: "Removed", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such ability", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(deleteKeyRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const { type, name } = c.req.valid("param")
  if (!(await abilityService.deleteKey(user.id, type, name))) return notFound(c, "Ability not found")
  return c.json({ ok: true }, 200)
})
