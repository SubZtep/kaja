import { OpenAPIHono } from "@hono/zod-openapi"
import { commandService, nodeService } from "../../services"
import type { RouteProps } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminCommands } from "./command"

const attachServices = async (c: any, next: any) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  await next()
}

/**
 * Node command management: signed-in (non-banned) users; handlers enforce node ownership.
 * Platform-admin-only: GET /admin/nodes/all (registered before parameterized routes).
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/nodes/all", adminMiddleware)
adminRoutes.get("/nodes/all", async c => {
  const nodes = await nodeService.getAllActiveNodes()
  return c.json({ nodes })
})

registerAdminCommands(adminRoutes)
