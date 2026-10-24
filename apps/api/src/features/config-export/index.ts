import { OpenAPIHono } from "@hono/zod-openapi"
import type { RouteProps } from "../../types"
import { registerConfigDefaults } from "./defaults"

/** Public, unauthenticated `/config/*`: the JSON Schemas and the sounds. */
export const configExportRoutes = new OpenAPIHono<RouteProps>()
registerConfigDefaults(configExportRoutes)
