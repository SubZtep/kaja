import { Hono } from "hono"
import type { RouteVariables } from "#/types"

export const healthRoutes = new Hono<{ Variables: RouteVariables }>()
healthRoutes.get("/", c => {
  return c.json({ status: "ok" })
})
