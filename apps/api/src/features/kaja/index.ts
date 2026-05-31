import { OpenAPIHono } from "@hono/zod-openapi"
import { db } from "../../core/db"
import type { RouteProps } from "../../types"
import { registerAdminCommands } from "./routes/admin/command"
import { registerConnect } from "./routes/node/connect"
import { registerDisconnect } from "./routes/node/disconnect"
import { registerHeartbeat } from "./routes/node/heartbeat"
import { registerList } from "./routes/node/list"
import { registerStream } from "./routes/node/stream"
import { CommandService } from "./services/command"
import { NodeService } from "./services/node"

export const nodeService = new NodeService(db)
export const commandService = new CommandService(db)

// Middleware factory to attach services to context
const attachServices = async (c: any, next: any) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  await next()
}

// Node routes (authenticated)
export const nodeRoutes = new OpenAPIHono<RouteProps>()
nodeRoutes.use("*", attachServices)
registerHeartbeat(nodeRoutes)
registerConnect(nodeRoutes)
registerDisconnect(nodeRoutes)
registerList(nodeRoutes)
registerStream(nodeRoutes)

// Admin routes (TODO: add adminMiddleware when implemented)
export const adminRoutes = new OpenAPIHono<RouteProps>()
adminRoutes.use("*", attachServices)
registerAdminCommands(adminRoutes)
