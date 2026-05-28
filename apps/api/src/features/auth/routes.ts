import type { Hono } from "hono"
import type { RouteProps } from "../../types"
import { auth } from "./auth"

export function registerAuthRoutes(app: Hono<RouteProps>) {
  app.on(["POST", "GET"], "/*", c => auth.handler(c.req.raw))
}
