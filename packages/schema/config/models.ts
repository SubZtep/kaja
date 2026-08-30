import * as z from "zod"

// One API endpoint, shared by every model that names it. Its api_key lives in secrets.toml's [providers.<name>].
const ProviderSchema = z.object({
  base_url: z.url()
})

export const TaskSchema = z.enum([
  "chat",
  "text-to-speech",
  "speech-to-text",
  "embedding",
  "image-generation",
  "rerank"
])

const ModelEntrySchema = z.object({
  // The name sent to the provider's API, e.g. "accounts/fireworks/models/minimax-m3".
  model: z.string().min(1),
  task: TaskSchema,
  // Which [providers.*] table holds the credentials.
  provider: z.string().min(1)
})

// One optional [models.<id>] key per task: the model actually in use for that task.
const ActiveSchema = z.object({
  chat: z.string().min(1).optional(),
  embedding: z.string().min(1).optional(),
  rerank: z.string().min(1).optional(),
  "image-generation": z.string().min(1).optional(),
  "text-to-speech": z.string().min(1).optional(),
  "speech-to-text": z.string().min(1).optional()
})

export const ModelsFileSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema).default({}),
    // Keyed by id, e.g. [models.fast-chat] — referenced by [active].<task> and persona [models].<task> pins.
    models: z.record(z.string(), ModelEntrySchema).default({}),
    active: ActiveSchema.default({})
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
    for (const [task, id] of Object.entries(data.active)) {
      if (id === undefined) continue
      const entry = data.models[id]
      if (!entry) {
        ctx.addIssue({
          code: "custom",
          path: ["active", task],
          message: `active.${task} names unknown model id "${id}"`
        })
      } else if (entry.task !== task) {
        ctx.addIssue({
          code: "custom",
          path: ["active", task],
          message: `active.${task} names model id "${id}" whose task is "${entry.task}", not "${task}"`
        })
      }
    }
  })

export type KajaModelsFile = z.infer<typeof ModelsFileSchema>
export type ModelTask = z.infer<typeof TaskSchema>
export type KajaActiveModels = z.infer<typeof ActiveSchema>

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
