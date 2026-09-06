import { OpenAPIHono } from "@hono/zod-openapi"
import { env } from "../../core/env"
import { modelService } from "../../services"
import type { RouteProps } from "../../types"
import { unauthorized } from "../../types/errors"
import { registerGetModel } from "./model-route"

const attachServices = async (c: any, next: any) => {
  c.set("modelService", modelService)
  await next()
}

/**
 * Shared-secret bearer for /config/* (no per-user auth).
 * Fail-closed: missing/empty CONFIG_API_TOKEN denies every request so provider
 * API keys in models.toml / model JSON cannot be scraped when misconfigured.
 */
export function isValidConfigToken(authHeader: string | undefined | null, token: string | undefined | null): boolean {
  if (!token) return false
  return authHeader === `Bearer ${token}`
}

const configTokenAuth = async (c: any, next: any) => {
  const token = env.CONFIG_API_TOKEN
  if (!isValidConfigToken(c.req.header("authorization"), token)) {
    return unauthorized(c)
  }
  await next()
}

export const configRoutes = new OpenAPIHono<RouteProps>()
configRoutes.use("*", configTokenAuth)
configRoutes.use("*", attachServices)
registerGetModel(configRoutes)
