import * as z from "zod"

export const KajaPreferencesSchema = z.object({
  thinking: z.boolean().optional().describe("Show thinking indicator when the model is generating a response"),
  sounds: z.boolean().optional().describe("Enable sound effects"),
  voice: z.boolean().optional().describe("Enable voice output (text-to-speech)"),
  locale: z.enum(["en-GB", "hu-HU", "nan-TW"]).optional().describe("Language for the chat and application"),
  // Written by the setup wizard. Without it the mode is guessed from "is there a usable chat model?", which
  // silently falls back to cloud when models.toml is missing, broken, or deliberately left for hand-editing.
  mode: z
    .enum(["cloud", "local"])
    .optional()
    .describe("Which backend `kaja` starts: the cloud API, or the local agent against your own provider"),
  // No modifier is universal in a terminal: Alt can type special characters instead of acting as a modifier on some
  // macOS terminals (Terminal.app/iTerm2 without "Option as Meta" enabled); Ctrl+<letter> can collide with host-app
  // global shortcuts (e.g. VS Code's integrated terminal reserves several of them regardless of focus).
  hotkeyModifier: z
    .enum(["alt", "ctrl"])
    .optional()
    .describe("Modifier key for the help/persona hotkeys (default: alt)")
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
  preferences: KajaPreferencesSchema.optional().describe("In-app preferences")
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaPreferences = z.infer<typeof KajaPreferencesSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
