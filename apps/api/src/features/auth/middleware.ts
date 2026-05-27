import { createMiddleware } from "hono/factory"
import type { RouteVariables } from "#/types"
import { auth } from "./auth"

export const authMiddleware = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  let user = null

  // Bearer token from Authorization header
  const authHeader = c.req.header("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    const session = await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) })
    user = session?.user ?? null
  }

  // Cookie session fallback
  if (!user) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    user = session?.user ?? null
  }

  c.set("user", user)

  await next()
})

export const adminMiddleware = createMiddleware<{ Variables: RouteVariables }>(async (c, next) => {
  const user = c.get("user")

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  // TODO: Check if user has admin role using Better Auth admin plugin
  // For now, allow all authenticated users to send commands
  // To add admin check later, query the user table for role field

  await next()
})
