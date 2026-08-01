import { OpenAPIHono } from "@hono/zod-openapi"
import { commandService, mcpServerService, modelService, nodeService } from "../../services"
import type { RouteProps } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminCommands } from "./command"
import { registerAdminMcpServers } from "./mcp-server"
import { registerAdminModels } from "./model"

const attachServices = async (c: any, next: any) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  c.set("mcpServerService", mcpServerService)
  c.set("modelService", modelService)
  await next()
}

/**
 * Node command management: signed-in (non-banned) users; handlers enforce node ownership.
 * Platform-admin-only: GET /admin/nodes/all, /admin/mcp-servers/*, /admin/providers/*, /admin/models/*
 * (registered before parameterized routes).
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/nodes/all", adminMiddleware)
adminRoutes.get("/nodes/all", async c => {
  const nodes = await nodeService.getAllActiveNodes()
  return c.json({ nodes })
})

adminRoutes.use("/mcp-servers/*", adminMiddleware)
registerAdminMcpServers(adminRoutes)

adminRoutes.use("/providers/*", adminMiddleware)
adminRoutes.use("/models/*", adminMiddleware)
registerAdminModels(adminRoutes)

registerAdminCommands(adminRoutes)
