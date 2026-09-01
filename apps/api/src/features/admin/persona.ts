import { createRoute, z } from "@hono/zod-openapi"
import { listPersonasResponseSchema } from "@kaja/schema/api"
import type { RouteRegProps } from "../../types"
import { unauthorized } from "../../types/errors"
import { listPersonas } from "../nasi/personas"

const errorSchema = z.object({ error: z.string() })

const listPersonasRoute = createRoute({
  method: "get",
  path: "/personas",
  tags: ["Admin"],
  summary: "List personas (from docs/config/personas/*.toml)",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "List of personas", content: { "application/json": { schema: listPersonasResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminPersonas(app: RouteRegProps) {
  app.openapi(listPersonasRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    return c.json({ personas: listPersonas() })
  })
}
