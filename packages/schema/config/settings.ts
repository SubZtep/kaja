import * as z from "zod"

export const KajaPreferencesSchema = z.object({
  thinking: z.boolean().optional().describe("Show thinking indicator when the model is generating a response"),
  sounds: z.boolean().optional().describe("Enable sound effects"),
  voice: z.boolean().optional().describe("Enable voice output (text-to-speech)"),
  language: z.enum(["en", "hu"]).optional().describe("Language for the chat and application"),
  // Id of the last-selected persona (see @kaja/schema/cli's personas.ts), so the app
  // reopens with it instead of always defaulting to the first one.
  persona: z.string().min(1).optional().describe("Id of the persona to open with (see personas.toml)")
})

export const KajaModelRefSchema = z.object({
  model: z.string().min(1).describe("Provider-facing model name, sent as-is to the API"),
  provider: z
    .string()
    .min(1)
    .optional()
    .describe("models.toml [providers.*] table to use; omit to fall back to the free hosted tier")
})
export type KajaModelRef = z.infer<typeof KajaModelRefSchema>

// Every task (chat, embedding, rerank, image-generation, text-to-speech,
// speech-to-text) resolves the same way: model is the literal provider-facing
// name sent straight to the API, provider names a models.toml [providers.*]
// table for its credentials (see lib/models/models.ts resolveModelFromConfig).
// chat's provider is optional — omitting it falls back to the free hosted
// chat tier (using the given model name); every other task requires a
// provider, since there's no free tier for them.
export const KajaModelsSchema = z.object({
  chat: KajaModelRefSchema.optional().describe("Chat model; omit to use the free hosted tier"),
  embedding: KajaModelRefSchema.optional(),
  rerank: KajaModelRefSchema.optional(),
  "image-generation": KajaModelRefSchema.optional(),
  "text-to-speech": KajaModelRefSchema.optional(),
  "speech-to-text": KajaModelRefSchema.optional()
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
  // validate/autocomplete settings.json; not consumed by the CLI itself.
  $schema: z.url().optional(),
  models: KajaModelsSchema,
  stt: KajaSttSchema.optional(),
  tts: KajaTtsSchema.optional(),
  memory: KajaMemorySchema.optional(),
  preferences: KajaPreferencesSchema.optional().describe("In-app preferences (slash menu)")
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaPreferences = z.infer<typeof KajaPreferencesSchema>
export type KajaModels = z.infer<typeof KajaModelsSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
