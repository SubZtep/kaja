import { z } from "zod"

/**
 * One docs/config/personas/<id>.toml file's shape, as consumed by the hosted API. Deliberately
 * narrower than @kaja/schema/cli's Persona (no models/dataset) — those are CLI-only concerns and
 * importing that package here would cross an app-owned schema boundary. Sampling overrides are
 * duplicated from @kaja/schema/cli's SamplingParamsSchema for the same reason — keep the two in sync.
 */
export const personaTomlSchema = z.object({
  label: z.string().min(1),
  instructions: z.string().min(1).optional(),
  when: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional()
})

export const listPersonasResponseSchema = z.object({
  personas: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      when: z.string().optional()
    })
  )
})

export type PersonaToml = z.infer<typeof personaTomlSchema> & { id: string }
export type ListPersonasResponse = z.infer<typeof listPersonasResponseSchema>
