import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  mySandboxesResponseSchema,
  publicSandboxesResponseSchema,
  sandboxKeyResponseSchema,
  sandboxSettingsPatchSchema,
  sandboxSettingsSchema
} from "@kaja/schema/api"
import { sandboxService } from "../../services"
import type { RouteVariables } from "../../types"
import { notFound, unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"
import { sandboxConnect, sandboxOwnerMiddleware } from "./connect"

export { mcpSandboxFor, rememberPlace, tunnelFor, userForPseudonym } from "./registry"

const errorSchema = z.object({ error: z.string() })
const unauthorizedResponse = {
  description: "Unauthorized",
  content: { "application/json": { schema: errorSchema } }
}

/** /sandbox: sandboxes connect here, and users manage their own (key, settings) here. */
export const sandboxRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()

// A sandbox isn't a signed-in user: its key (or none) says whose it is.
sandboxRoutes.get("/connect", sandboxOwnerMiddleware, sandboxConnect)

const publicRoute = createRoute({
  method: "get",
  path: "/public",
  tags: ["Sandbox"],
  summary: "How many MCP sandboxes are online, and in which countries",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: publicSandboxesResponseSchema } } }
  }
})

sandboxRoutes.openapi(publicRoute, async c => c.json(await sandboxService.onlineByCountry(), 200))

sandboxRoutes.use("/", requireAuthMiddleware)
sandboxRoutes.use("/key", requireAuthMiddleware)
sandboxRoutes.use("/settings", requireAuthMiddleware)
sandboxRoutes.use("/:id{[0-9a-fA-F-]{36}}", requireAuthMiddleware)

const mineRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Sandbox"],
  summary: "The signed-in user's sandbox settings and their own sandboxes",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: mySandboxesResponseSchema } } },
    401: unauthorizedResponse
  }
})

sandboxRoutes.openapi(mineRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  const [settings, sandboxes] = await Promise.all([
    sandboxService.settings(user.id),
    sandboxService.listForUser(user.id)
  ])
  return c.json({ settings, sandboxes }, 200)
})

const keyRoute = createRoute({
  method: "post",
  path: "/key",
  tags: ["Sandbox"],
  summary: "Makes a new sandbox key (replacing the old one), shown this once",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: sandboxKeyResponseSchema } } },
    401: unauthorizedResponse
  }
})

sandboxRoutes.openapi(keyRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json({ key: await sandboxService.createKey(user.id) }, 200)
})

const settingsRoute = createRoute({
  method: "patch",
  path: "/settings",
  tags: ["Sandbox"],
  summary: "Whether others may use the user's sandboxes, and whether the user may use others'",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: sandboxSettingsPatchSchema } }, required: true } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: sandboxSettingsSchema } } },
    401: unauthorizedResponse
  }
})

sandboxRoutes.openapi(settingsRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json(await sandboxService.updateSettings(user.id, c.req.valid("json")), 200)
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Sandbox"],
  summary: "Removes one of the user's own sandboxes that's offline",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Removed" },
    401: unauthorizedResponse,
    404: { description: "No such offline sandbox", content: { "application/json": { schema: errorSchema } } }
  }
})

sandboxRoutes.openapi(deleteRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  if (!(await sandboxService.deleteOffline(user.id, c.req.valid("param").id))) return notFound(c)
  return c.body(null, 204)
})
