import { createRoute, z } from "@hono/zod-openapi"
import { adminModulesResponseSchema, updateAdminModuleSchema } from "@kaja/schema/api"
import { errorSchema } from "../../core/errors"
import { moduleService } from "../../services"
import type { RouteRegProps } from "../../types"

const listRoute = createRoute({
  method: "get",
  path: "/modules",
  tags: ["Admin"],
  summary: "Every module: whether it is on, and how its background jobs are doing",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: adminModulesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const updateRoute = createRoute({
  method: "patch",
  path: "/modules/{id}",
  tags: ["Admin"],
  summary: "Switch a module on or off for everyone (off: no tools, no prompt section, no jobs)",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: updateAdminModuleSchema } } }
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: adminModulesResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "No such module", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminModules(app: RouteRegProps) {
  app.openapi(listRoute, async c => c.json({ modules: await moduleService.list() }, 200))

  app.openapi(updateRoute, async c => {
    const { id } = c.req.valid("param")
    const { enabled } = c.req.valid("json")
    if (!(await moduleService.setEnabled(id, enabled))) return c.json({ error: "No such module" }, 404)
    return c.json({ modules: await moduleService.list() }, 200)
  })
}
