import * as z from "zod"

/** Optional chat completion sampling overrides; unset means provider default. Shared with lib/agents.ts's Agent.sampling. */
export const SamplingParamsSchema = z.object({
  /** Randomness of token selection, 0 (deterministic) to 2 (most random). */
  temperature: z.number().min(0).max(2).optional(),
  /** Nucleus sampling threshold: only tokens in the top `top_p` probability mass are considered. */
  top_p: z.number().min(0).max(1).optional(),
  /** Maximum number of tokens to generate in the completion. */
  max_tokens: z.number().int().positive().optional(),
  /** Penalizes tokens by how often they've already appeared, -2 to 2; positive values discourage repetition. */
  frequency_penalty: z.number().min(-2).max(2).optional(),
  /** Penalizes tokens that have appeared at all so far, -2 to 2; positive values encourage new topics. */
  presence_penalty: z.number().min(-2).max(2).optional(),
  /** Fixes the sampling seed for (best-effort) reproducible outputs across requests. */
  seed: z.number().int().optional()
})

// model is optional (falls back to the app default); persona id comes from
// its filename, attached by loadPersonas().
export const PersonaSchema = z
  .object({
    label: z.string().min(1),
    instructions: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    // Topic id (datasets.ts filename) this persona collects via dataset_info; optional.
    dataset: z.string().min(1).optional(),
    // Short clause describing when this persona fits; shown in the system-prompt persona roster.
    when: z.string().min(1).optional()
  })
  .extend(SamplingParamsSchema.shape)

export type Persona = z.infer<typeof PersonaSchema> & { id: string }
export type SamplingParams = z.infer<typeof SamplingParamsSchema>
