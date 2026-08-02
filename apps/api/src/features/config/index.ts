import { OpenAPIHono } from "@hono/zod-openapi"
import { mcpServerService, modelService } from "../../services"
import type { RouteProps } from "../../types"
import { unauthorized } from "../../types/errors"
import { registerMcpToml } from "./mcp-toml-route"
import { registerGetModel } from "./model-route"
import { registerModelsToml } from "./models-toml-route"

const attachServices = async (c: any, next: any) => {
  c.set("mcpServerService", mcpServerService)
  c.set("modelService", modelService)
  await next()
}

/** Same shared-secret token for everyone (no per-user auth); blocks casual/bot scraping of provider API keys. */
const configTokenAuth = async (c: any, next: any) => {
  const token = process.env.CONFIG_API_TOKEN
  if (token) {
    const authHeader = c.req.header("authorization")
    if (authHeader !== `Bearer ${token}`) return unauthorized(c)
  }
  await next()
}

export const configRoutes = new OpenAPIHono<RouteProps>()
configRoutes.use("*", configTokenAuth)
configRoutes.use("*", attachServices)
registerMcpToml(configRoutes)
registerModelsToml(configRoutes)
registerGetModel(configRoutes)
