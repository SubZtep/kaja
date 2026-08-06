import * as z from "zod"

export const KajaSettingsSchema = z.object({
  thinking: z.boolean().optional().describe("Show thinking indicator when the model is generating a response"),
  sounds: z.boolean().optional().describe("Enable sound effects"),
  voice: z.boolean().optional().describe("Enable voice output (text-to-speech)"),
  language: z.enum(["en", "hu"]).optional().describe("Language for the chat and application"),
  // Id of the last-selected persona (see schemas/personas.ts), so the app
  // reopens with it instead of always defaulting to the first one.
  persona: z.string().min(1).optional().describe("Id of the persona to open with (see personas.toml)")
})

// Every task (chat, embedding, rerank, image-generation, text-to-speech,
// speech-to-text) resolves through models.toml the same way: the value here
// is a models.toml `id`, looked up for its provider credentials + model
// name (see lib/models.ts resolveModelById). chat is optional — omitting it
// falls back to the free hosted chat tier; every other task is opt-in too.
export const KajaModelsSchema = z.object({
  chat: z.string().min(1).optional().describe("models.toml id to use for chat; omit to use the free hosted tier"),
  embedding: z.string().min(1).optional(),
  rerank: z.string().min(1).optional(),
  "image-generation": z.string().min(1).optional(),
  "text-to-speech": z.string().min(1).optional(),
  "speech-to-text": z.string().min(1).optional()
})

// Feature groups: each is a self-contained block of config for one feature.
// stt/tts/location/webSearch are optional — when a group is absent, that
// feature is simply unavailable rather than crashing the app. Only the
// non-model settings live here now — the model itself comes from
// models.<task> above.
export const KajaSttSchema = z.object({
  speachesUrl: z.url().optional().describe("Speaches AI server endpoint (speech-to-text)"),
  language: z.string().min(1).optional().describe("Language hint for speech-to-text, e.g. 'en'")
})

export const KajaTtsSchema = z.object({
  speachesUrl: z.url().optional().describe("Speaches AI server endpoint (text-to-speech)"),
  voice: z.string().min(1).optional().describe("Voice name to use for text-to-speech")
})

export const KajaMemorySchema = z.object({
  dbPath: z
    .string()
    .min(1)
    .optional()
    .describe("Absolute path to the SQLite memory database; omit to use the default XDG data location")
})

/** location/webSearch/telegram/api (external service credentials) live in services.toml */
export const KajaConfigSchema = z.object({
  // Editor tooling (e.g. VS Code's JSON language server) uses this to
  // validate/autocomplete config.json; not consumed by the CLI itself.
  $schema: z.url().optional(),
  models: KajaModelsSchema,
  stt: KajaSttSchema.optional(),
  tts: KajaTtsSchema.optional(),
  memory: KajaMemorySchema.optional(),
  settings: KajaSettingsSchema.optional().describe("In-app preferences (slash menu)")
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaSettings = z.infer<typeof KajaSettingsSchema>
export type KajaModels = z.infer<typeof KajaModelsSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
