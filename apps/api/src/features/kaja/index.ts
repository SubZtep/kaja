import { OpenAPIHono } from "@hono/zod-openapi"
import type { RouteProps } from "../../types"
import { adminMiddleware, requireAuthMiddleware } from "../auth"
import { registerAdminCommands } from "./routes/admin/command"
import { registerCommandLifecycle } from "./routes/node/command"
import { registerCommandStream } from "./routes/node/command-stream"
import { registerConnect } from "./routes/node/connect"
import { registerDisconnect } from "./routes/node/disconnect"
import { registerHeartbeat } from "./routes/node/heartbeat"
import { registerList } from "./routes/node/list"
import { registerStream } from "./routes/node/stream"
import { commandService, nodeService } from "./services"

export { commandService, nodeService }

// Middleware factory to attach services to context
const attachServices = async (c: any, next: any) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  await next()
}

// Node routes (authenticated handlers check session)
export const nodeRoutes = new OpenAPIHono<RouteProps>()
nodeRoutes.use("*", attachServices)
registerHeartbeat(nodeRoutes)
registerConnect(nodeRoutes)
registerDisconnect(nodeRoutes)
registerList(nodeRoutes)
registerStream(nodeRoutes)
registerCommandStream(nodeRoutes)
registerCommandLifecycle(nodeRoutes)

// Node command management: signed-in (non-banned) users; handlers enforce node ownership.
// Platform-admin-only: GET /admin/nodes/all (register before parameterized routes).
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", requireAuthMiddleware)
adminRoutes.use("*", attachServices)

adminRoutes.use("/nodes/all", adminMiddleware)
adminRoutes.get("/nodes/all", async c => {
  const nodes = await nodeService.getAllActiveNodes()
  return c.json({ nodes })
})

registerAdminCommands(adminRoutes)
