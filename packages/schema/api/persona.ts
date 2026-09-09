import { z } from "zod"

// Duplicated from @kaja/schema/cli's PersonaModelsSchema — see packages/schema/api/persona-toml.ts's note on why CLI and API schemas are kept separate.
const personaModelsSchema = z
  .object({
    chat: z.string().min(1).optional(),
    embedding: z.string().min(1).optional(),
    rerank: z.string().min(1).optional(),
    "image-generation": z.string().min(1).optional(),
    tts: z.string().min(1).optional(),
    stt: z.string().min(1).optional()
  })
  .default({})

// Duplicated from @kaja/schema/cli's SamplingParamsSchema — same reason.
const personaSamplingSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    top_k: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().optional()
  })
  .default({})

export const personaSchema = z.object({
  id: z.string(),
  personaId: z.string().min(1),
  label: z.string().min(1),
  when: z.string().nullable(),
  instructions: z.string().nullable(),
  dataset: z.string().nullable(),
  models: personaModelsSchema,
  sampling: personaSamplingSchema,
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createPersonaRequestSchema = z.object({
  personaId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, "must be lowercase alphanumeric, may include - or _"),
  label: z.string().min(1),
  when: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  dataset: z.string().min(1).optional(),
  models: personaModelsSchema.optional(),
  sampling: personaSamplingSchema.optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0)
})

export const updatePersonaRequestSchema = z.object({
  personaId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-_]*$/, "must be lowercase alphanumeric, may include - or _")
    .optional(),
  label: z.string().min(1).optional(),
  when: z.string().min(1).nullable().optional(),
  instructions: z.string().min(1).nullable().optional(),
  dataset: z.string().min(1).nullable().optional(),
  models: personaModelsSchema.optional(),
  sampling: personaSamplingSchema.optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional()
})

export const listPersonasResponseSchema = z.object({
  personas: z.array(personaSchema)
})

export type Persona = z.infer<typeof personaSchema>
export type CreatePersonaRequest = z.infer<typeof createPersonaRequestSchema>
export type UpdatePersonaRequest = z.infer<typeof updatePersonaRequestSchema>
export type ListPersonasResponse = z.infer<typeof listPersonasResponseSchema>
