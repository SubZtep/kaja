import { Hono } from "hono"
import type { RouteProps } from "../../types"
import { registerAuthRoutes } from "./routes"

export * from "./middleware"

export const authRoutes = new Hono<RouteProps>()

registerAuthRoutes(authRoutes)
