import * as z from "zod"

// Credentials for one API endpoint, shared by every model that names it.
const ProviderSchema = z.object({
  base_url: z.url(),
  api_key: z.string().min(1).optional()
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
  // Stable slug this model is looked up by (config.json's models.<task> value);
  // a DB uuid for server-fetched files, any unique string for local templates.
  id: z.string().min(1),
  // The name sent to the provider's API, e.g. "accounts/fireworks/models/minimax-m3".
  model: z.string().min(1),
  task: TaskSchema,
  // Which [providers.*] table holds the credentials; omitted means "default".
  provider: z.string().min(1).optional()
})

export const ModelsFileSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema).default({}),
    models: z.array(ModelSchema).default([])
  })
  .superRefine((data, ctx) => {
    data.models.forEach((model, index) => {
      const name = model.provider ?? "default"
      if (!data.providers[name]) {
        ctx.addIssue({
          code: "custom",
          path: ["models", index, "provider"],
          message: model.provider
            ? `Unknown provider "${name}"`
            : `Model "${model.id}" names no provider and [providers.default] is missing`
        })
      }
    })
  })

export type KajaModelsFile = z.infer<typeof ModelsFileSchema>
export type ModelTask = z.infer<typeof TaskSchema>

/** A model entry flattened with its provider's credentials. */
export type ResolvedModel = {
  id: string
  task: ModelTask
  baseUrl: string
  apiKey?: string
}
