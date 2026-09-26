import * as z from "zod"

export const KajaPreferencesSchema = z.object({
  thinking: z.boolean().optional().describe("Show thinking indicator when the model is generating a response"),
  sounds: z.boolean().optional().describe("Enable sound effects"),
  voice: z.boolean().optional().describe("Enable voice output (text-to-speech)"),
  locale: z
    .enum(["en-GB", "en-US", "hu-HU", "nan-TW", "zh-TW"])
    .optional()
    .describe("Language for the chat and application"),
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
    .describe("Modifier key for the help/persona hotkeys (default: alt)"),
  theme: z
    .enum(["auto", "dark", "light"])
    .optional()
    .describe("Colour theme; auto asks the terminal for its background colour (default: auto)")
})

// Per-feature config blocks; the model itself is the one models.toml's [tasks] names.
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

export const KajaMarketplaceSchema = z.object({
  enabled: z
    .boolean()
    .optional()
    .describe("Use the online marketplace; false means Kaja never goes online for abilities (default: true)"),
  autoFetch: z
    .boolean()
    .optional()
    .describe("Pull the marketplace at startup when the last sync is over a day old (default: true)")
})

export const KajaContextSchema = z.object({
  compact_at: z
    .number()
    .min(0.3)
    .max(0.95)
    .optional()
    .describe(
      "How full the chat model's context may get (0.3-0.95) before older messages are summarised (default: 0.8)"
    )
})

/** telegram (external service credentials) lives in secrets.toml */
export const KajaConfigSchema = z.object({
  stt: KajaSttSchema.optional(),
  tts: KajaTtsSchema.optional(),
  memory: KajaMemorySchema.optional(),
  marketplace: KajaMarketplaceSchema.optional().describe("Fetching abilities from the online marketplace"),
  context: KajaContextSchema.optional().describe("Keeping long conversations inside the model's context window"),
  preferences: KajaPreferencesSchema.optional().describe("In-app preferences")
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaPreferences = z.infer<typeof KajaPreferencesSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
export type KajaMarketplace = z.infer<typeof KajaMarketplaceSchema>
export type KajaContext = z.infer<typeof KajaContextSchema>
