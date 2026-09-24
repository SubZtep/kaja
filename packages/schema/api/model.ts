import { z } from "zod"

export const modelTaskSchema = z.enum(["chat", "tts", "stt", "embedding", "image-generation", "rerank", "summarize"])

export const providerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  baseUrl: z.url(),
  hasApiKey: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createProviderRequestSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.url(),
  apiKey: z.string().min(1).optional()
})

export const updateProviderRequestSchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.url().optional(),
  apiKey: z.string().min(1).optional()
})

export const listProvidersResponseSchema = z.object({
  providers: z.array(providerSchema)
})

export const modelSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  model: z.string().min(1),
  tasks: z.array(modelTaskSchema).min(1),
  enabled: z.boolean(),
  free: z.boolean(),
  /** Tokens the model takes in; null means it's detected from the provider. */
  contextWindow: z.number().int().positive().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable()
})

export const createModelRequestSchema = z.object({
  providerId: z.string().min(1),
  model: z.string().min(1),
  tasks: z.array(modelTaskSchema).min(1),
  enabled: z.boolean().default(true),
  free: z.boolean().default(false),
  contextWindow: z.number().int().positive().nullable().default(null)
})

export const updateModelRequestSchema = z.object({
  providerId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  tasks: z.array(modelTaskSchema).min(1).optional(),
  enabled: z.boolean().optional(),
  free: z.boolean().optional(),
  /** null clears it back to detection. */
  contextWindow: z.number().int().positive().nullable().optional()
})

export const listModelsResponseSchema = z.object({
  models: z.array(modelSchema)
})

export const resolvedModelSchema = z.object({
  id: z.string(),
  model: z.string(),
  tasks: z.array(modelTaskSchema),
  baseUrl: z.url(),
  apiKey: z.string().nullable()
})

export type ModelTask = z.infer<typeof modelTaskSchema>
export type Provider = z.infer<typeof providerSchema>
export type CreateProviderRequest = z.infer<typeof createProviderRequestSchema>
export type UpdateProviderRequest = z.infer<typeof updateProviderRequestSchema>
export type ListProvidersResponse = z.infer<typeof listProvidersResponseSchema>
export type Model = z.infer<typeof modelSchema>
export type CreateModelRequest = z.infer<typeof createModelRequestSchema>
export type UpdateModelRequest = z.infer<typeof updateModelRequestSchema>
export type ListModelsResponse = z.infer<typeof listModelsResponseSchema>
export type ResolvedModel = z.infer<typeof resolvedModelSchema>
