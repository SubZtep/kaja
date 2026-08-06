import { createRoute, z } from "@hono/zod-openapi"
import { resolvedModelSchema } from "@kaja/schema"
import type { RouteRegProps } from "../../types"
import { notFound } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })
const idParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
})

const getModelRoute = createRoute({
  method: "get",
  path: "/models/{id}",
  tags: ["Config"],
  summary: "Resolve a model to its provider credentials",
  request: { params: idParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: resolvedModelSchema } } },
    404: { description: "Model not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const getRandomModelRoute = createRoute({
  method: "get",
  path: "/models",
  tags: ["Config"],
  summary: "Resolve a random free+enabled model to its provider credentials",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: resolvedModelSchema } } },
    404: { description: "No free enabled models", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerGetModel(app: RouteRegProps) {
  app.openapi(getModelRoute, async c => {
    const { id } = c.req.valid("param")
    const modelService = c.get("modelService")
    const result = await modelService.getModelWithProvider(id)
    if (!result) return notFound(c, "Model not found")

    const { model, provider } = result
    return c.json({
      id: model.id,
      model: model.model,
      tasks: model.tasks,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey
    })
  })

  app.openapi(getRandomModelRoute, async c => {
    const modelService = c.get("modelService")
    const result = await modelService.getRandomModelWithProvider()
    if (!result) return notFound(c, "No free enabled models")

    const { model, provider } = result
    return c.json({
      id: model.id,
      model: model.model,
      tasks: model.tasks,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey
    })
  })
}
