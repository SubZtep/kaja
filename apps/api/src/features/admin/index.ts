import { OpenAPIHono } from "@hono/zod-openapi"
import { createMiddleware } from "hono/factory"
import { modelService } from "../../services"
import type { RouteProps, RouteVariables } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminAbilities } from "./ability"
import { registerAdminCatalog } from "./catalog"
import { registerAdminImages } from "./images"
import { registerAdminModels } from "./model"
import { registerAdminSandbox } from "./sandbox"

const attachServices = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  c.set("modelService", modelService)
  await next()
})

/**
 * Platform-admin-only: /admin/providers/_, /admin/models/_, /admin/catalog/_, /admin/abilities/sync and
 * /admin/abilities/keys/_, /admin/sandbox, /admin/users/:id/images, /admin/images.
 */
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/providers/*", adminMiddleware)
adminRoutes.use("/models/*", adminMiddleware)
registerAdminModels(adminRoutes)

adminRoutes.use("/catalog/*", adminMiddleware)
registerAdminCatalog(adminRoutes)

adminRoutes.use("/abilities/*", adminMiddleware)
registerAdminAbilities(adminRoutes)

adminRoutes.use("/sandbox", adminMiddleware)
adminRoutes.use("/sandbox/*", adminMiddleware)
registerAdminSandbox(adminRoutes)

adminRoutes.use("/users/*", adminMiddleware)
adminRoutes.use("/images", adminMiddleware)
adminRoutes.use("/images/*", adminMiddleware)
registerAdminImages(adminRoutes)
