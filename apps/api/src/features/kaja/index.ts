import { Hono } from "hono"
import { pool } from "#/core/db"
import type { RouteProps } from "#/types"
import { registerHeartbeat } from "./routes/node/heartbeat"
import { registerSpawnNode } from "./routes/node/register"
import { NodeService } from "./services/node"

export const nodeService = new NodeService(pool)

export const kajaRoutes = new Hono<RouteProps>()

// Middleware to attach services to context
kajaRoutes.use("*", async (c, next) => {
  c.set("nodeService", nodeService)
  await next()
})

registerHeartbeat(kajaRoutes)
registerSpawnNode(kajaRoutes)
