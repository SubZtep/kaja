import * as z from "zod"

// Credentials for one API endpoint, shared by every model that names it.
const ProviderSchema = z.object({
  base_url: z.url(),
  api_key: z.string().min(1).optional(),
  // Marks this table as the fallback for models that omit `provider`. If
  // several providers set this, the first one (table order) wins.
  default: z.boolean().optional()
})

export const TaskSchema = z.enum([
  "chat",
  "text-to-speech",
  "speech-to-text",
  "embedding",
  "image-generation",
  "rerank"
])

const ModelSchema = z.object({
  // The name sent to the provider's API, e.g. "accounts/fireworks/models/minimax-m3".
  model: z.string().min(1),
  task: TaskSchema,
  // Which [providers.*] table holds the credentials; omitted means "whichever
  // provider has default = true" (see ProviderSchema).
  provider: z.string().min(1).optional()
})

export const ModelsFileSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema).default({}),
    models: z.array(ModelSchema).default([])
  })
  .superRefine((data, ctx) => {
    const hasDefaultProvider = Object.values(data.providers).some(p => p.default)
    data.models.forEach((model, index) => {
      if (model.provider) {
        if (!data.providers[model.provider]) {
          ctx.addIssue({
            code: "custom",
            path: ["models", index, "provider"],
            message: `Unknown provider "${model.provider}"`
          })
        }
      } else if (!hasDefaultProvider) {
        ctx.addIssue({
          code: "custom",
          path: ["models", index, "provider"],
          message: `Model "${model.model}" names no provider and no [providers.*] table has default = true`
        })
      }
    })
  })

export type KajaModelsFile = z.infer<typeof ModelsFileSchema>
export type ModelTask = z.infer<typeof TaskSchema>

/** A model entry flattened with its provider's credentials. */
export type CliResolvedModel = {
  /** The provider-facing model name, sent as the API "model" request parameter. */
  model: string
  task: ModelTask
  baseUrl: string
  apiKey?: string
  /** The `[providers.*]` table key this model resolved to, e.g. "fireworks". */
  provider: string
}
