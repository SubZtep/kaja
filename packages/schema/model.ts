import { z } from "zod"

export const modelTaskSchema = z.enum([
  "chat",
  "text-to-speech",
  "speech-to-text",
  "embedding",
  "image-generation",
  "rerank"
])

export const providerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  baseUrl: z.url(),
  apiKey: z.string().min(1).nullable(),
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
  modelId: z.string().min(1),
  task: modelTaskSchema,
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createModelRequestSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  task: modelTaskSchema,
  enabled: z.boolean().default(true)
})

export const updateModelRequestSchema = z.object({
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  task: modelTaskSchema.optional(),
  enabled: z.boolean().optional()
})

export const listModelsResponseSchema = z.object({
  models: z.array(modelSchema)
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
