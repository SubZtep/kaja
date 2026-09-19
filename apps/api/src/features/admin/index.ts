import { OpenAPIHono } from "@hono/zod-openapi"
import { createMiddleware } from "hono/factory"
import { mcpServerService, modelService } from "../../services"
import type { RouteProps, RouteVariables } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminMcpServers } from "./mcp-server"
import { registerAdminModels } from "./model"
import { registerAdminPackages } from "./package"

const attachServices = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  c.set("mcpServerService", mcpServerService)
  c.set("modelService", modelService)
  await next()
})

/**
 * Platform-admin-only: /admin/mcp-servers/*, /admin/providers/*, /admin/models/*,
 * /admin/packages/sync (registered before parameterized routes).
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/mcp-servers/*", adminMiddleware)
registerAdminMcpServers(adminRoutes)

adminRoutes.use("/providers/*", adminMiddleware)
adminRoutes.use("/models/*", adminMiddleware)
registerAdminModels(adminRoutes)

adminRoutes.use("/packages/*", adminMiddleware)
registerAdminPackages(adminRoutes)
