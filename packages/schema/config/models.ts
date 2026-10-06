import * as z from "zod"

// One API endpoint, shared by every model that names it. Its api_key lives in secrets.toml's [providers.<name>].
const ProviderSchema = z.object({
  base_url: z.url()
})

export const TaskSchema = z.enum(["chat", "tts", "stt", "embedding", "image-generation", "rerank", "summarize"])

const ModelEntrySchema = z.object({
  // The name sent to the provider's API, e.g. "accounts/fireworks/models/minimax-m3".
  model: z.string().min(1),
  // Which [providers.*] table holds the credentials.
  provider: z.string().min(1),
  // What it can be used for; for each task, the first [models.*] in the file that lists it is the one used.
  tasks: z.array(TaskSchema).min(1),
  // Tokens the model can take in; omit it and Kaja asks the server, else assumes 32768.
  context_window: z.number().int().positive().optional()
})

export const ModelsFileSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema).default({}),
    // Keyed by an id of your choosing (the wizard uses the model name's slug); persona [models].<task> pins name these too.
    // File order matters: each task uses the first entry that lists it, so comment one out and the next takes over.
    models: z.record(z.string(), ModelEntrySchema).default({})
  })
  .superRefine((data, ctx) => {
    for (const [id, entry] of Object.entries(data.models)) {
      // JS objects put integer-like keys first, which would lose the file order picking relies on.
      if (/^\d+$/.test(id)) {
        ctx.addIssue({ code: "custom", path: ["models", id], message: `[models.${id}] needs a non-numeric id` })
      }
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

/** A models.toml entry flattened with its provider's credentials, once per task it lists. */
export type CliResolvedModel = {
  /** The `[models.<id>]` key, e.g. "glm-5p3-flash". Used for persona pins and lookups. */
  id: string
  /** The provider-facing model name, sent as the API "model" request parameter. */
  model: string
  /** One of the entry's `tasks`; a model listing several resolves once for each. */
  task: ModelTask
  baseUrl: string
  apiKey?: string
  /** The `[providers.*]` table key this model resolved to, e.g. "fireworks". */
  provider: string
  /** `context_window` from models.toml; unset means detect it from the server. */
  contextWindow?: number
}
