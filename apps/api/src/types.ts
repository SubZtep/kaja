import type { OpenAPIHono } from "@hono/zod-openapi"
import type { McpServerService } from "./services/mcp-server"
import type { ModelService } from "./services/model"

// user type from better-auth session (admin plugin adds role / ban fields)
export type AuthSessionUser = {
  id: string
  email: string
  name?: string
  role?: string | null
  banned?: boolean | null
}

// context variables for Hono
export type RouteVariables = {
  user: AuthSessionUser | null
  mcpServerService: McpServerService
  modelService: ModelService
}

/** common route properties. */
export type RouteProps = { Variables: RouteVariables }

/** Register functions properties for route register helpers. */
export type RouteRegProps = OpenAPIHono<RouteProps>
