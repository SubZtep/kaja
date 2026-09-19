import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { statsQuerySchema, usageStatsResponseSchema } from "@kaja/schema/api"
import { statsService } from "../../services"
import type { RouteVariables } from "../../types"
import { unauthorized } from "../../types/errors"
import { requireAuthMiddleware } from "../auth"

const errorSchema = z.object({ error: z.string() })

/** /stats: the signed-in user's own activity, worked out from their saved sessions. */
export const statsRoutes = new OpenAPIHono<{ Variables: RouteVariables }>()
statsRoutes.use("*", requireAuthMiddleware)

const usageRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Stats"],
  summary: "When the signed-in user talked, which tools ran, and which personas and models were used",
  security: [{ bearerAuth: [] }],
  request: { query: statsQuerySchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: usageStatsResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } }
  }
})

statsRoutes.openapi(usageRoute, async c => {
  const user = c.get("user")
  if (!user) return unauthorized(c)
  return c.json(await statsService.usage(user.id, c.req.valid("query").days), 200)
})
