import { createRoute, z } from "@hono/zod-openapi"
import type { RouteRegProps } from "../../types"
import { listPersonas } from "../nasi/personas"
import { renderPersonasToml } from "./render-toml"

const personasTomlRoute = createRoute({
  method: "get",
  path: "/personas.toml",
  tags: ["Config"],
  summary: "Generate personas.toml from docs/config/personas/*.toml",
  responses: {
    200: {
      description: "OK",
      content: {
        "application/toml": {
          schema: z.string()
        }
      }
    }
  }
})

export function registerPersonasToml(app: RouteRegProps) {
  app.openapi(personasTomlRoute, async c => {
    const toml = renderPersonasToml(listPersonas())
    return c.text(toml, 200, { "Content-Type": "application/toml" }) as any
  })
}
