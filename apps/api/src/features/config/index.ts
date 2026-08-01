import { OpenAPIHono } from "@hono/zod-openapi"
import { mcpServerService, modelService } from "../../services"
import type { RouteProps } from "../../types"
import { registerMcpToml } from "./mcp-toml-route"
import { registerModelsToml } from "./models-toml-route"

const attachServices = async (c: any, next: any) => {
  c.set("mcpServerService", mcpServerService)
  c.set("modelService", modelService)
  await next()
}

/** Config routes (unauthenticated: served the same way for everyone). */
export const configRoutes = new OpenAPIHono<RouteProps>()
configRoutes.use("*", attachServices)
registerMcpToml(configRoutes)
registerModelsToml(configRoutes)
