import { OpenAPIHono } from "@hono/zod-openapi"
import { mcpServerService, modelService, personaService } from "../../services"
import type { RouteProps } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminMcpServers } from "./mcp-server"
import { registerAdminModels } from "./model"
import { registerAdminPersonas } from "./persona"

const attachServices = async (c: any, next: any) => {
  c.set("mcpServerService", mcpServerService)
  c.set("modelService", modelService)
  c.set("personaService", personaService)
  await next()
}

/**
 * Platform-admin-only: /admin/mcp-servers/*, /admin/providers/*, /admin/models/*,
 * /admin/personas/* (registered before parameterized routes).
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/mcp-servers/*", adminMiddleware)
registerAdminMcpServers(adminRoutes)

adminRoutes.use("/providers/*", adminMiddleware)
adminRoutes.use("/models/*", adminMiddleware)
registerAdminModels(adminRoutes)

adminRoutes.use("/personas/*", adminMiddleware)
registerAdminPersonas(adminRoutes)
