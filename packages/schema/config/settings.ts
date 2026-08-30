import * as z from "zod"

export const KajaPreferencesSchema = z.object({
  thinking: z.boolean().optional().describe("Show thinking indicator when the model is generating a response"),
  sounds: z.boolean().optional().describe("Enable sound effects"),
  voice: z.boolean().optional().describe("Enable voice output (text-to-speech)"),
  language: z.enum(["en", "hu"]).optional().describe("Language for the chat and application"),
  // Id of the last-selected persona (see @kaja/schema/cli's personas.ts), so the app reopens with it instead of always defaulting to the first one.
  persona: z.string().min(1).optional().describe("Id of the persona to open with (see personas.toml)")
})

// Per-feature config blocks; the model itself lives in models.toml's [models.*]/[active].
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
  stt: KajaSttSchema.optional(),
  tts: KajaTtsSchema.optional(),
  memory: KajaMemorySchema.optional(),
  preferences: KajaPreferencesSchema.optional().describe("In-app preferences (slash menu)")
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaPreferences = z.infer<typeof KajaPreferencesSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
