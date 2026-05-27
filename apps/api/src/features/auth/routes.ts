import type { Hono } from "hono"
import { auth } from "#/features/auth/auth"
import type { RouteProps } from "#/types"

export function registerAuthRoutes(app: Hono<RouteProps>) {
  app.on(["POST", "GET"], "/*", c => auth.handler(c.req.raw))
}
