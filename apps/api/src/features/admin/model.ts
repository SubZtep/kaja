import { createRoute, z } from "@hono/zod-openapi"
import {
  createModelRequestSchema,
  createProviderRequestSchema,
  listModelsResponseSchema,
  listProvidersResponseSchema,
  modelSchema,
  providerSchema,
  updateModelRequestSchema,
  updateProviderRequestSchema
} from "@kaja/schema/api"
import type { RouteRegProps } from "../../types"
import { notFound, unauthorized } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })
const idParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
})

const listProvidersRoute = createRoute({
  method: "get",
  path: "/providers",
  tags: ["Admin"],
  summary: "List all providers",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "List of providers", content: { "application/json": { schema: listProvidersResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const createProviderRoute = createRoute({
  method: "post",
  path: "/providers",
  tags: ["Admin"],
  summary: "Create a provider",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createProviderRequestSchema } } }
  },
  responses: {
    201: { description: "Provider created successfully", content: { "application/json": { schema: providerSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const updateProviderRoute = createRoute({
  method: "patch",
  path: "/providers/{id}",
  tags: ["Admin"],
  summary: "Update a provider",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updateProviderRequestSchema } } }
  },
  responses: {
    200: { description: "Provider updated successfully", content: { "application/json": { schema: providerSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Provider not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const deleteProviderRoute = createRoute({
  method: "delete",
  path: "/providers/{id}",
  tags: ["Admin"],
  summary: "Delete a provider",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: {
      description: "Provider deleted successfully",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Provider not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const listModelsRoute = createRoute({
  method: "get",
  path: "/models",
  tags: ["Admin"],
  summary: "List all models",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "List of models", content: { "application/json": { schema: listModelsResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const createModelRoute = createRoute({
  method: "post",
  path: "/models",
  tags: ["Admin"],
  summary: "Create a model",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createModelRequestSchema } } }
  },
  responses: {
    201: { description: "Model created successfully", content: { "application/json": { schema: modelSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const updateModelRoute = createRoute({
  method: "patch",
  path: "/models/{id}",
  tags: ["Admin"],
  summary: "Update a model",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updateModelRequestSchema } } }
  },
  responses: {
    200: { description: "Model updated successfully", content: { "application/json": { schema: modelSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Model not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const deleteModelRoute = createRoute({
  method: "delete",
  path: "/models/{id}",
  tags: ["Admin"],
  summary: "Delete a model",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: {
      description: "Model deleted successfully",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Model not found", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminModels(app: RouteRegProps) {
  app.openapi(listProvidersRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const modelService = c.get("modelService")
    const providers = await modelService.listProviders()
    return c.json({ providers })
  })

  app.openapi(createProviderRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const body = c.req.valid("json")
    const modelService = c.get("modelService")
    const provider = await modelService.createProvider(body)
    return c.json(provider, 201)
  })

  app.openapi(updateProviderRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const body = c.req.valid("json")
    const modelService = c.get("modelService")
    const provider = await modelService.updateProvider(id, body)
    if (!provider) return notFound(c, "Provider not found")
    return c.json(provider)
  })

  app.openapi(deleteProviderRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const modelService = c.get("modelService")
    const success = await modelService.deleteProvider(id)
    if (!success) return notFound(c, "Provider not found")
    return c.json({ success })
  })

  app.openapi(listModelsRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const modelService = c.get("modelService")
    const models = await modelService.listModels()
    return c.json({ models })
  })

  app.openapi(createModelRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const body = c.req.valid("json")
    const modelService = c.get("modelService")
    const model = await modelService.createModel(body)
    return c.json(model, 201)
  })

  app.openapi(updateModelRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const body = c.req.valid("json")
    const modelService = c.get("modelService")
    const model = await modelService.updateModel(id, body)
    if (!model) return notFound(c, "Model not found")
    return c.json(model)
  })

  app.openapi(deleteModelRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const modelService = c.get("modelService")
    const success = await modelService.deleteModel(id)
    if (!success) return notFound(c, "Model not found")
    return c.json({ success })
  })
}
