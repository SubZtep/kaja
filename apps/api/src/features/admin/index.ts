import { OpenAPIHono } from "@hono/zod-openapi"
import { createMiddleware } from "hono/factory"
import { modelService } from "../../services"
import type { RouteProps, RouteVariables } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminAbilities } from "./ability"
import { registerAdminModels } from "./model"

const attachServices = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  c.set("modelService", modelService)
  await next()
})

/**
 * Platform-admin-only: /admin/providers/*, /admin/models/*,
 * /admin/abilities/sync (registered before parameterized routes).
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/providers/*", adminMiddleware)
adminRoutes.use("/models/*", adminMiddleware)
registerAdminModels(adminRoutes)

adminRoutes.use("/abilities/*", adminMiddleware)
registerAdminAbilities(adminRoutes)
