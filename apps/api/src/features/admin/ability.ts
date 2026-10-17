import { createRoute, z } from "@hono/zod-openapi"
import {
  listAbilityKeysResponseSchema,
  marketplaceSyncResultSchema,
  marketplaceSyncStatusSchema,
  saveAbilityKeyRequestSchema,
  saveAbilityKeyResponseSchema
} from "@kaja/schema/api"
import { abilityService, marketplaceService } from "../../services"
import type { RouteRegProps } from "../../types"
import { badGateway, badRequest, notFound, serviceUnavailable } from "../../types/errors"
import { sessionUser } from "../auth"
import { cloudEgress, cloudSandbox } from "../nasi/chat"

const errorSchema = z.object({ error: z.string() })
const keyParams = z.object({
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: "name", in: "path" }, example: "web-search" })
})

const syncStatusRoute = createRoute({
  method: "get",
  path: "/abilities/sync",
  tags: ["Admin"],
  summary: "Last marketplace sync: commit, time, and error if it failed",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: marketplaceSyncStatusSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const syncNowRoute = createRoute({
  method: "post",
  path: "/abilities/sync",
  tags: ["Admin"],
  summary: "Sync the ability catalog from the marketplace repo now (skipped when the branch hasn't moved)",
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ force: z.enum(["true", "false"]).optional() }) },
  responses: {
    200: { description: "Synced", content: { "application/json": { schema: marketplaceSyncResultSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    502: { description: "GitHub or the tarball failed", content: { "application/json": { schema: errorSchema } } }
  }
})

const listServiceKeysRoute = createRoute({
  method: "get",
  path: "/abilities/keys",
  tags: ["Admin"],
  summary: "Every ability that takes a key, and whether it has a server-wide key",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listAbilityKeysResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const saveServiceKeyRoute = createRoute({
  method: "put",
  path: "/abilities/keys/{name}",
  tags: ["Admin"],
  summary: "Save (or replace) an ability's server-wide key, and test it",
  description:
    "Every user shares it, and calls with it go only through the official sandbox. Stored encrypted and never sent back; tested with the ability's `check` request or by connecting to its MCP server, and saved even when the test fails.",
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
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Not in the catalog", content: { "application/json": { schema: errorSchema } } },
    503: {
      description: "`keys_unavailable`: the server can't store keys",
      content: { "application/json": { schema: errorSchema } }
    }
  }
})

const deleteServiceKeyRoute = createRoute({
  method: "delete",
  path: "/abilities/keys/{name}",
  tags: ["Admin"],
  summary: "Remove an ability's server-wide key",
  security: [{ bearerAuth: [] }],
  request: { params: keyParams },
  responses: {
    200: { description: "Removed", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such ability", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminAbilities(app: RouteRegProps) {
  app.openapi(syncStatusRoute, async c => c.json(await marketplaceService.status(), 200))

  app.openapi(syncNowRoute, async c => {
    const { force } = c.req.valid("query")
    try {
      return c.json(await marketplaceService.sync({ force: force === "true" }), 200)
    } catch (error) {
      return badGateway(c, error instanceof Error ? error.message : String(error))
    }
  })

  app.openapi(listServiceKeysRoute, async c =>
    c.json({ abilities: await abilityService.listServiceKeys(), keysEnabled: abilityService.keysEnabled }, 200)
  )

  app.openapi(saveServiceKeyRoute, async c => {
    if (!abilityService.keysEnabled) return serviceUnavailable(c, "keys_unavailable")
    const admin = sessionUser(c)
    const name = c.req.valid("param").name
    const apiKey = c.req.valid("json").apiKey
    // Tested the way turns will use it: a server-wide key only ever reaches the official sandbox.
    const service = () => ({ value: apiKey, own: false })
    const sandbox = cloudSandbox(admin.id, service)
    const result = await abilityService
      .saveServiceKey(name, apiKey, { send: cloudEgress(admin.id, service)(name), sandbox })
      .finally(() => sandbox.close?.())
    if (result === "not_found") return notFound(c, "Ability not found")
    if (result === "no_key") return badRequest(c, "no_key")
    return c.json(result, 200)
  })

  app.openapi(deleteServiceKeyRoute, async c => {
    if (!(await abilityService.deleteServiceKey(c.req.valid("param").name))) return notFound(c, "Ability not found")
    return c.json({ ok: true }, 200)
  })
}
