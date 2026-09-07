import * as z from "zod"

// One API endpoint, shared by every model that names it. Its api_key lives in secrets.toml's [providers.<name>].
const ProviderSchema = z.object({
  base_url: z.url()
})

export const TaskSchema = z.enum(["chat", "tts", "stt", "embedding", "image-generation", "rerank"])

const ModelEntrySchema = z.object({
  // The name sent to the provider's API, e.g. "accounts/fireworks/models/minimax-m3".
  model: z.string().min(1),
  task: TaskSchema,
  // Which [providers.*] table holds the credentials.
  provider: z.string().min(1)
})

export const ModelsFileSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema).default({}),
    // Keyed by id, expected to equal the task name, e.g. [models.chat] — referenced by persona [models].<task> pins.
    models: z.record(z.string(), ModelEntrySchema).default({})
  })
  .superRefine((data, ctx) => {
    for (const [id, entry] of Object.entries(data.models)) {
      if (!data.providers[entry.provider]) {
        ctx.addIssue({
          code: "custom",
          path: ["models", id, "provider"],
          message: `Unknown provider "${entry.provider}"`
        })
      }
    }
  })

export type KajaModelsFile = z.infer<typeof ModelsFileSchema>
export type ModelTask = z.infer<typeof TaskSchema>

/** A models.toml entry flattened with its provider's credentials. */
export type CliResolvedModel = {
  /** The `[models.<id>]` key, e.g. "fast-chat". Used for persona/active-ref lookups. */
  id: string
  /** The provider-facing model name, sent as the API "model" request parameter. */
  model: string
  task: ModelTask
  baseUrl: string
  apiKey?: string
  /** The `[providers.*]` table key this model resolved to, e.g. "fireworks". */
  provider: string
}
