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
export const kajaRoutes = new OpenAPIHono<RouteProps>()

// Middleware to attach services to context
kajaRoutes.use("*", async (c, next) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  await next()
})

// Node routes (authenticated)
registerHeartbeat(kajaRoutes)
registerConnect(kajaRoutes)
registerDisconnect(kajaRoutes)
registerList(kajaRoutes)
registerStream(kajaRoutes)

// Admin routes (TODO: add adminMiddleware when implemented)
registerAdminCommands(kajaRoutes)
