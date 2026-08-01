import { OpenAPIHono } from "@hono/zod-openapi"
import { commandService, nodeService } from "../../services"
import type { RouteProps } from "../../types"
import { registerCommandLifecycle } from "./command"
import { registerCommandStream } from "./command-stream"
import { registerConnect } from "./connect"
import { registerDisconnect } from "./disconnect"
import { registerHeartbeat } from "./heartbeat"
import { registerList } from "./list"
import { registerStream } from "./stream"

const attachServices = async (c: any, next: any) => {
  c.set("nodeService", nodeService)
  c.set("commandService", commandService)
  await next()
}

/** Node routes (authenticated handlers check session). */
export const nodeRoutes = new OpenAPIHono<RouteProps>()
nodeRoutes.use("*", attachServices)
registerHeartbeat(nodeRoutes)
registerConnect(nodeRoutes)
registerDisconnect(nodeRoutes)
registerList(nodeRoutes)
registerStream(nodeRoutes)
registerCommandStream(nodeRoutes)
registerCommandLifecycle(nodeRoutes)
