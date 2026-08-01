import { createRoute, z } from "@hono/zod-openapi"
import type { RouteRegProps } from "../../types"
import { renderModelsToml } from "./render-toml"

const modelsTomlRoute = createRoute({
  method: "get",
  path: "/models.toml",
  tags: ["Config"],
  summary: "Generate models.toml from enabled providers and models",
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

export function registerModelsToml(app: RouteRegProps) {
  app.openapi(modelsTomlRoute, async c => {
    const modelService = c.get("modelService")
    const { providers, models } = await modelService.listEnabledWithProviders()
    const toml = renderModelsToml(providers, models)
    return c.text(toml, 200, { "Content-Type": "application/toml" }) as any
  })
}
