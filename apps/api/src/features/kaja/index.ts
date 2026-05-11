import { Hono } from "hono"
import { pool } from "#/core/db"
import type { RouteProps } from "#/types"
import { registerConnect } from "./routes/node/connect"
import { registerHeartbeat } from "./routes/node/heartbeat"
import { NodeService } from "./services/node"

export const nodeService = new NodeService(pool)

export const kajaRoutes = new Hono<RouteProps>()

// Middleware to attach services to context
kajaRoutes.use("*", async (c, next) => {
  c.set("nodeService", nodeService)
  await next()
})

registerHeartbeat(kajaRoutes)
registerConnect(kajaRoutes)
