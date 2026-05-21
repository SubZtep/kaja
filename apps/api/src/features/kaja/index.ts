import { Hono } from "hono"
import { pool } from "#/core/db"
import type { RouteProps } from "#/types"
import { registerAdminCommands } from "./routes/admin/command"
import { registerConnect } from "./routes/node/connect"
import { registerHeartbeat } from "./routes/node/heartbeat"
import { registerList } from "./routes/node/list"
import { CommandService } from "./services/command"
import { NodeService } from "./services/node"

export const nodeService = new NodeService(pool)
export const commandService = new CommandService(pool)

export const kajaRoutes = new Hono<RouteProps>()

// Middleware to attach services to context
kajaRoutes.use("*", async (c, next) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  await next()
})

// Node routes (authenticated)
registerHeartbeat(kajaRoutes)
registerConnect(kajaRoutes)
registerList(kajaRoutes)

// Admin routes (TODO: add adminMiddleware when implemented)
registerAdminCommands(kajaRoutes)
