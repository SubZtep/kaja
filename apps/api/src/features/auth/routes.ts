import type { Hono } from "hono"
import { withSsrClientIp } from "../../core/ssr-client-ip"
import type { RouteProps } from "../../types"
import { auth } from "./auth"

export function registerAuthRoutes(app: Hono<RouteProps>) {
  // Better Auth rate-limits by X-Forwarded-For, so hand it the visitor's IP on the web's SSR calls
  app.on(["POST", "GET"], "/*", c => auth.handler(withSsrClientIp(c.req.raw)))
}
