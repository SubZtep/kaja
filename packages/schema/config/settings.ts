import * as z from "zod"

export const KajaPreferencesSchema = z.object({
  thinking: z.boolean().optional().describe("Show thinking indicator when the model is generating a response"),
  sounds: z.boolean().optional().describe("Enable sound effects"),
  voice: z.boolean().optional().describe("Enable voice output (text-to-speech)"),
  language: z.enum(["en", "hu"]).optional().describe("Language for the chat and application"),
  // Id of the last-selected persona (see @kaja/schema/cli's personas.ts), so the app reopens with it instead of always defaulting to the first one.
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

// Each task resolves to a model + models.toml provider; only chat's provider is optional (falls back to the free tier).
export const KajaModelsSchema = z.object({
  chat: KajaModelRefSchema.optional().describe("Chat model; omit to use the free hosted tier"),
  embedding: KajaModelRefSchema.optional(),
  rerank: KajaModelRefSchema.optional(),
  "image-generation": KajaModelRefSchema.optional(),
  "text-to-speech": KajaModelRefSchema.optional(),
  "speech-to-text": KajaModelRefSchema.optional()
})

// Per-feature config blocks; the model itself lives in models.<task> above.
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
  // For editor autocomplete/validation only; not read by the CLI.
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
