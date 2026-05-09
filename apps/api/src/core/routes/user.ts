import { Hono } from "hono"
import type { RouteVariables } from "#/types"

export const userRoutes = new Hono<{ Variables: RouteVariables }>()
userRoutes.get("/me", c => {
  const user = c.get("user")
  if (!user) return c.json({ error: "Unauthorized" }, 401)

  return c.json({ id: user.id, email: user.email })
})
