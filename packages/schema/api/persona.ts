import { z } from "zod"

export const personaSchema = z.object({
  id: z.string(),
  personaId: z.string().min(1),
  label: z.string().min(1),
  instructions: z.string().min(1).nullable(),
  when: z.string().min(1).nullable(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
})

export const createPersonaRequestSchema = z.object({
  personaId: z.string().min(1),
  label: z.string().min(1),
  instructions: z.string().min(1).optional(),
  when: z.string().min(1).optional(),
  enabled: z.boolean().default(true)
})

export const updatePersonaRequestSchema = z.object({
  personaId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  when: z.string().min(1).optional(),
  enabled: z.boolean().optional()
})

export const listPersonasResponseSchema = z.object({
  personas: z.array(personaSchema)
})

export type Persona = z.infer<typeof personaSchema>
export type CreatePersonaRequest = z.infer<typeof createPersonaRequestSchema>
export type UpdatePersonaRequest = z.infer<typeof updatePersonaRequestSchema>
export type ListPersonasResponse = z.infer<typeof listPersonasResponseSchema>
