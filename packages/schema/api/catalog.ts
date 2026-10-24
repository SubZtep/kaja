import { z } from "zod"
import { modelTaskSchema } from "./model"

/**
 * The public catalog shape's version, sent with `GET /config/catalog`: a client that doesn't know it ignores the
 * catalog. Bump on a change an older client can't read.
 */
export const PUBLIC_CATALOG_VERSION = 2

export const catalogKindSchema = z.enum(["hosted", "self-hosted"])
export const catalogSourceSchema = z.enum(["modelsdev", "admin"])
export const catalogModelStatusSchema = z.enum(["deprecated", "removed"])

const slugSchema = z.string().regex(/^[a-z0-9-]+$/)

export const catalogProviderSchema = z.object({
  id: z.string(),
  /** The `[providers.<slug>]` key users get. */
  slug: slugSchema,
  name: z.string().min(1),
  kind: catalogKindSchema,
  /** Models.dev's address; `baseUrl` overrides it. */
  apiUrl: z.string().nullable(),
  baseUrl: z.url().nullable(),
  doc: z.string().nullable(),
  npm: z.string().nullable(),
  note: z.string().nullable(),
  position: z.number().int(),
  listed: z.boolean(),
  source: catalogSourceSchema,
  /** Models that aren't removed. */
  modelCount: z.number().int(),
  /** Tasks with a default model. */
  defaultTasks: z.array(modelTaskSchema),
  syncedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createCatalogProviderRequestSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  kind: catalogKindSchema,
  baseUrl: z.url(),
  note: z.string().nullable().default(null)
})

export const updateCatalogProviderRequestSchema = z.object({
  name: z.string().min(1).optional(),
  kind: catalogKindSchema.optional(),
  /** Null goes back to models.dev's address. */
  baseUrl: z.url().nullable().optional(),
  note: z.string().nullable().optional(),
  position: z.number().int().optional(),
  listed: z.boolean().optional()
})

export const listCatalogProvidersResponseSchema = z.object({
  providers: z.array(catalogProviderSchema)
})

export const catalogModelSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  model: z.string().min(1),
  name: z.string().nullable(),
  tasks: z.array(modelTaskSchema),
  tasksEdited: z.boolean(),
  defaultTasks: z.array(modelTaskSchema),
  contextWindow: z.number().int().positive().nullable(),
  images: z.boolean(),
  status: catalogModelStatusSchema.nullable(),
  source: catalogSourceSchema,
  syncedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createCatalogModelRequestSchema = z.object({
  model: z.string().min(1),
  name: z.string().nullable().default(null),
  tasks: z.array(modelTaskSchema).min(1),
  contextWindow: z.number().int().positive().nullable().default(null),
  images: z.boolean().default(false)
})

export const updateCatalogModelRequestSchema = z.object({
  name: z.string().nullable().optional(),
  /** Stops the sync overwriting them. */
  tasks: z.array(modelTaskSchema).optional(),
  /** Must be among its tasks; taken off the provider's other models. */
  defaultTasks: z.array(modelTaskSchema).optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  images: z.boolean().optional()
})

export const listCatalogModelsResponseSchema = z.object({
  models: z.array(catalogModelSchema)
})

export const catalogSyncStatusSchema = z.object({
  syncedAt: z.coerce.date().nullable(),
  error: z.string().nullable()
})

export const catalogSyncResultSchema = z.object({
  /** False when models.dev answered 304, so nothing was read. */
  changed: z.boolean(),
  providers: z.object({ added: z.number().int(), updated: z.number().int() }),
  models: z.object({ added: z.number().int(), updated: z.number().int(), removed: z.number().int() })
})

/** One model in `GET /config/catalog`. */
export const publicCatalogModelSchema = z.object({
  model: z.string().min(1),
  name: z.string().nullable(),
  tasks: z.array(modelTaskSchema),
  /** Tasks this model is the provider's default for. */
  default_tasks: z.array(modelTaskSchema),
  context_window: z.number().int().positive().nullable(),
  images: z.boolean()
})

/** One provider in `GET /config/catalog`, in the order a contested task's default goes by. */
export const publicCatalogProviderSchema = z.object({
  /** The `[providers.<id>]` key, and the name its API key goes under in secrets.toml. */
  id: slugSchema,
  name: z.string().min(1),
  /** Hosted is asked for an API key, self-hosted (the user's own server) for its address. */
  kind: catalogKindSchema,
  base_url: z.url(),
  note: z.string().nullable(),
  doc: z.string().nullable(),
  models: z.array(publicCatalogModelSchema)
})

/** `GET /config/catalog`: the providers the setup wizard offers, from the database. */
export const publicCatalogSchema = z.object({
  version: z.number().int(),
  providers: z.array(publicCatalogProviderSchema)
})

export type CatalogKind = z.infer<typeof catalogKindSchema>
export type CatalogProvider = z.infer<typeof catalogProviderSchema>
export type CreateCatalogProviderRequest = z.infer<typeof createCatalogProviderRequestSchema>
export type UpdateCatalogProviderRequest = z.infer<typeof updateCatalogProviderRequestSchema>
export type ListCatalogProvidersResponse = z.infer<typeof listCatalogProvidersResponseSchema>
export type CatalogModel = z.infer<typeof catalogModelSchema>
export type CreateCatalogModelRequest = z.infer<typeof createCatalogModelRequestSchema>
export type UpdateCatalogModelRequest = z.infer<typeof updateCatalogModelRequestSchema>
export type ListCatalogModelsResponse = z.infer<typeof listCatalogModelsResponseSchema>
export type CatalogSyncStatus = z.infer<typeof catalogSyncStatusSchema>
export type CatalogSyncResult = z.infer<typeof catalogSyncResultSchema>
export type PublicCatalog = z.infer<typeof publicCatalogSchema>
export type PublicCatalogProvider = z.infer<typeof publicCatalogProviderSchema>
