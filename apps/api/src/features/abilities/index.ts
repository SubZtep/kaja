import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  listAbilityKeysResponseSchema,
  saveAbilityKeyRequestSchema,
  saveAbilityKeyResponseSchema
} from "@kaja/schema/api"
import { abilityService } from "../../services"
import type { RouteVariables } from "../../types"
import { badRequest, notFound, serviceUnavailable } from "../../types/errors"
import { requireAuthMiddleware, sessionUser } from "../auth"
import { nasiToolDeps } from "../nasi/chat"

const errorSchema = z.object({ error: z.string() })
const keyParams = z.object({
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "brave-search" })
})

/** /abilities/me: the signed-in user's ability keys. Every ability is on for everyone; personas pick what a turn uses. */
export const abilityRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
abilityRoutes.use("/me", requireAuthMiddleware)
abilityRoutes.use("/me/*", requireAuthMiddleware)

const listKeysRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Abilities"],
  summary: "The abilities that take a key (and some persona uses), and whether the signed-in user saved one",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listAbilityKeysResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(listKeysRoute, async c => {
  const user = sessionUser(c)
  return c.json({ abilities: await abilityService.listKeys(user.id), keysEnabled: abilityService.keysEnabled }, 200)
})

const saveKeyRoute = createRoute({
  method: "put",
  path: "/me/keys/{name}",
  tags: ["Abilities"],
  summary: "Save (or replace) the signed-in user's key for an ability, and test it",
  description:
    "Stored encrypted and never sent back. An HTTP tool's key is tested with its `check` request, an MCP server's by connecting and listing its tools; the key is saved even when the test fails.",
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
  const user = sessionUser(c)
  if (!abilityService.keysEnabled) return serviceUnavailable(c, "keys_unavailable")
  // Same egress as a turn's tool calls: through WEB_PROXY when set, never to a private host.
  const result = await abilityService.saveKey(user.id, c.req.valid("param").name, c.req.valid("json").apiKey, {
    proxy: nasiToolDeps().fetchProxy
  })
  if (result === "not_found") return notFound(c, "Ability not found")
  if (result === "no_key") return badRequest(c, "no_key")
  return c.json(result, 200)
})

const deleteKeyRoute = createRoute({
  method: "delete",
  path: "/me/keys/{name}",
  tags: ["Abilities"],
  summary: "Remove the signed-in user's key for an ability",
  security: [{ bearerAuth: [] }],
  request: { params: keyParams },
  responses: {
    200: { description: "Removed", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such ability", content: { "application/json": { schema: errorSchema } } }
  }
})

abilityRoutes.openapi(deleteKeyRoute, async c => {
  const user = sessionUser(c)
  if (!(await abilityService.deleteKey(user.id, c.req.valid("param").name))) return notFound(c, "Ability not found")
  return c.json({ ok: true }, 200)
})
