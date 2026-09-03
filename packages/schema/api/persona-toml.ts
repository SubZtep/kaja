import { z } from "zod"

/**
 * One docs/config/personas/<id>.toml file's shape, as consumed by the hosted API. Deliberately
 * narrower than @kaja/schema/cli's Persona (no models/dataset/sampling) — those are CLI-only
 * concerns and importing that package here would cross an app-owned schema boundary.
 */
export const personaTomlSchema = z.object({
  label: z.string().min(1),
  instructions: z.string().min(1).optional(),
  when: z.string().min(1).optional()
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
