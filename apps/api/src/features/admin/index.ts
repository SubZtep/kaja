import { OpenAPIHono } from "@hono/zod-openapi"
import { createMiddleware } from "hono/factory"
import { modelService } from "../../services"
import type { RouteProps, RouteVariables } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminAbilities } from "./ability"
import { registerAdminModels } from "./model"
import { registerAdminSandbox } from "./sandbox"

const attachServices = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  c.set("modelService", modelService)
  await next()
})

/**
 * Platform-admin-only: /admin/providers/_, /admin/models/_, /admin/abilities/sync and /admin/abilities/keys/*,
 * /admin/sandbox.
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/providers/*", adminMiddleware)
adminRoutes.use("/models/*", adminMiddleware)
registerAdminModels(adminRoutes)

adminRoutes.use("/abilities/*", adminMiddleware)
registerAdminAbilities(adminRoutes)

adminRoutes.use("/sandbox", adminMiddleware)
adminRoutes.use("/sandbox/*", adminMiddleware)
registerAdminSandbox(adminRoutes)
