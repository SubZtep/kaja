import { createRoute, z } from "@hono/zod-openapi"
import {
  catalogModelSchema,
  catalogProviderSchema,
  catalogSyncResultSchema,
  catalogSyncStatusSchema,
  createCatalogModelRequestSchema,
  createCatalogProviderRequestSchema,
  listCatalogModelsResponseSchema,
  listCatalogProvidersResponseSchema,
  updateCatalogModelRequestSchema,
  updateCatalogProviderRequestSchema
} from "@kaja/schema/api"
import { catalogService } from "../../services"
import type { RouteRegProps } from "../../types"
import { badGateway, badRequest, conflict, notFound } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })
const idParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
})
const authErrors = {
  401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
  403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
} as const
const notFoundError = { description: "Not found", content: { "application/json": { schema: errorSchema } } } as const
const successSchema = z.object({ success: z.boolean() })

const listProvidersRoute = createRoute({
  method: "get",
  path: "/catalog/providers",
  tags: ["Admin"],
  summary: "List the catalog's providers, listed ones first",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listCatalogProvidersResponseSchema } } },
    ...authErrors
  }
})

const createProviderRoute = createRoute({
  method: "post",
  path: "/catalog/providers",
  tags: ["Admin"],
  summary: "Add a provider models.dev doesn't have (e.g. a self-hosted server)",
  security: [{ bearerAuth: [] }],
  request: { body: { content: { "application/json": { schema: createCatalogProviderRequestSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: catalogProviderSchema } } },
    ...authErrors,
    409: { description: "Slug taken", content: { "application/json": { schema: errorSchema } } }
  }
})

const getProviderRoute = createRoute({
  method: "get",
  path: "/catalog/providers/{id}",
  tags: ["Admin"],
  summary: "One catalog provider",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: catalogProviderSchema } } },
    ...authErrors,
    404: notFoundError
  }
})

const updateProviderRoute = createRoute({
  method: "patch",
  path: "/catalog/providers/{id}",
  tags: ["Admin"],
  summary: "List, reorder or edit a catalog provider",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updateCatalogProviderRequestSchema } } }
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: catalogProviderSchema } } },
    ...authErrors,
    404: notFoundError
  }
})

const deleteProviderRoute = createRoute({
  method: "delete",
  path: "/catalog/providers/{id}",
  tags: ["Admin"],
  summary: "Delete a catalog provider (a synced one returns, unlisted, on the next sync)",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: successSchema } } },
    ...authErrors,
    404: notFoundError
  }
})

const listModelsRoute = createRoute({
  method: "get",
  path: "/catalog/providers/{id}/models",
  tags: ["Admin"],
  summary: "List a catalog provider's models, defaults first",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: listCatalogModelsResponseSchema } } },
    ...authErrors
  }
})

const createModelRoute = createRoute({
  method: "post",
  path: "/catalog/providers/{id}/models",
  tags: ["Admin"],
  summary: "Add a model models.dev doesn't list to a catalog provider",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: createCatalogModelRequestSchema } } }
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: catalogModelSchema } } },
    ...authErrors,
    404: notFoundError,
    409: { description: "Model already listed", content: { "application/json": { schema: errorSchema } } }
  }
})

const updateModelRoute = createRoute({
  method: "patch",
  path: "/catalog/models/{id}",
  tags: ["Admin"],
  summary: "Edit a catalog model's tasks, defaults or limits",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updateCatalogModelRequestSchema } } }
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: catalogModelSchema } } },
    400: { description: "A default task it doesn't serve", content: { "application/json": { schema: errorSchema } } },
    ...authErrors,
    404: notFoundError
  }
})

const deleteModelRoute = createRoute({
  method: "delete",
  path: "/catalog/models/{id}",
  tags: ["Admin"],
  summary: "Delete a catalog model (a synced one returns on the next sync)",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: successSchema } } },
    ...authErrors,
    404: notFoundError
  }
})

const syncStatusRoute = createRoute({
  method: "get",
  path: "/catalog/sync",
  tags: ["Admin"],
  summary: "Last models.dev sync: time, and error if it failed",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: catalogSyncStatusSchema } } },
    ...authErrors
  }
})

const syncNowRoute = createRoute({
  method: "post",
  path: "/catalog/sync",
  tags: ["Admin"],
  summary: "Sync the catalog from models.dev now (skipped on a 304 unless forced)",
  security: [{ bearerAuth: [] }],
  request: { query: z.object({ force: z.enum(["true", "false"]).optional() }) },
  responses: {
    200: { description: "Synced", content: { "application/json": { schema: catalogSyncResultSchema } } },
    ...authErrors,
    502: { description: "models.dev failed", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminCatalog(app: RouteRegProps) {
  app.openapi(listProvidersRoute, async c => c.json({ providers: await catalogService.listProviders() }, 200))

  app.openapi(createProviderRoute, async c => {
    const provider = await catalogService.createProvider(c.req.valid("json"))
    if (provider === "taken") return conflict(c, "slug_taken")
    return c.json(provider, 201)
  })

  app.openapi(getProviderRoute, async c => {
    const provider = await catalogService.getProvider(c.req.valid("param").id)
    if (!provider) return notFound(c, "Provider not found")
    return c.json(provider, 200)
  })

  app.openapi(updateProviderRoute, async c => {
    const provider = await catalogService.updateProvider(c.req.valid("param").id, c.req.valid("json"))
    if (!provider) return notFound(c, "Provider not found")
    return c.json(provider, 200)
  })

  app.openapi(deleteProviderRoute, async c => {
    if (!(await catalogService.deleteProvider(c.req.valid("param").id))) return notFound(c, "Provider not found")
    return c.json({ success: true }, 200)
  })

  app.openapi(listModelsRoute, async c =>
    c.json({ models: await catalogService.listModels(c.req.valid("param").id) }, 200)
  )

  app.openapi(createModelRoute, async c => {
    const model = await catalogService.createModel(c.req.valid("param").id, c.req.valid("json"))
    if (!model) return notFound(c, "Provider not found")
    if (model === "taken") return conflict(c, "model_taken")
    return c.json(model, 201)
  })

  app.openapi(updateModelRoute, async c => {
    const model = await catalogService.updateModel(c.req.valid("param").id, c.req.valid("json"))
    if (!model) return notFound(c, "Model not found")
    if (model === "bad_default") return badRequest(c, "bad_default")
    return c.json(model, 200)
  })

  app.openapi(deleteModelRoute, async c => {
    if (!(await catalogService.deleteModel(c.req.valid("param").id))) return notFound(c, "Model not found")
    return c.json({ success: true }, 200)
  })

  app.openapi(syncStatusRoute, async c => c.json(await catalogService.syncStatus(), 200))

  app.openapi(syncNowRoute, async c => {
    try {
      return c.json(await catalogService.sync({ force: c.req.valid("query").force === "true" }), 200)
    } catch (error) {
      return badGateway(c, error instanceof Error ? error.message : String(error))
    }
  })
}
