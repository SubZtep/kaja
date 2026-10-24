import { locales } from "@kaja/shared/locale"
import * as z from "zod"

/** What each unset preference means; the TUI reads it, and the JSON Schema shows it to editors. */
export const PREFERENCE_DEFAULTS = {
  thinking: false,
  toolDisplay: "minimal",
  codePreviewLines: 5,
  voice: false,
  hotkeyModifier: "alt",
  theme: "auto",
  yolo: false
} as const

/** `[marketplace]`'s defaults: on, and kept up to date. */
export const MARKETPLACE_DEFAULTS = { enabled: true, autoFetch: true } as const

export const KajaPreferencesSchema = z.object({
  thinking: z
    .boolean()
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.thinking })
    .describe("Show thinking indicator when the model is generating a response"),
  toolDisplay: z
    .enum(["minimal", "verbose", "corner"])
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.toolDisplay })
    .describe(
      "How tool calls show: minimal keeps one live row and a summary line in the chat, verbose lists every call, corner shows the current call in the header"
    ),
  codePreviewLines: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.codePreviewLines })
    .describe("Lines of a code block or approval command shown before it is cut short"),
  voice: z
    .boolean()
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.voice })
    .describe("Read the assistant's replies aloud (needs a Speaches server, see [tts])"),
  locale: z.enum(locales).optional().describe("Language for the chat and application"),
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
    .enum(["alt", "ctrl", "meta", "ctrl+alt", "ctrl+meta", "alt+meta"])
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.hotkeyModifier })
    .describe(
      "Modifier key for the help/persona hotkeys; none works everywhere (alt types characters on some macOS terminals, ctrl collides with some host apps, meta needs the kitty keyboard protocol)"
    ),
  theme: z
    .enum(["auto", "dark", "light", "terminal"])
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.theme })
    .describe(
      "Colour theme; auto picks dark or light by the terminal's background colour, terminal uses the terminal's own colour scheme"
    ),
  yolo: z
    .boolean()
    .optional()
    .meta({ default: PREFERENCE_DEFAULTS.yolo })
    .describe(
      "DANGEROUS developer flag: approve every shell command and tool call without asking, risky ones included (the hard guards still apply)"
    )
})

// Per-feature config blocks; the model itself is models.toml's first one listing the task.
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
    .meta({ default: MARKETPLACE_DEFAULTS.enabled })
    .describe("Use the online marketplace; false means Kaja never goes online for abilities"),
  autoFetch: z
    .boolean()
    .optional()
    .meta({ default: MARKETPLACE_DEFAULTS.autoFetch })
    .describe("Pull the marketplace at startup when the last sync is over a day old"),
  url: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Git URL (or local path) of the repo whose marketplace/ folder `kaja abilities update` fetches (default: the Kaja repo)"
    ),
  ref: z.string().min(1).optional().describe("Branch or tag to fetch (default: main)")
})

export const KajaContextSchema = z.object({
  compact_at: z
    .number()
    .min(0.3)
    .max(0.95)
    .optional()
    .meta({ default: 0.8 })
    .describe(
      "How full the chat model's context may get (0.3-0.95) before older messages are summarised; `/compact` does it on demand"
    )
})

/** Where an ability runs: on this computer, or a Kaja sandbox (from local mode, reached through the Kaja API). */
export const ToolHostSchema = z.enum(["computer", "sandbox"])

export const KajaToolsSchema = z.object({
  hosts: z
    .record(z.string().min(1), ToolHostSchema)
    .optional()
    .describe(
      'Where each stdio MCP ability runs, by name: "computer" or "sandbox"; the default follows the mode (local: computer, cloud: sandbox). Local "sandbox" needs a Kaja cloud sign-in; cloud "computer" has the terminal run it. shell = "computer" lets cloud chat use this shell'
    )
})

/** Telegram (external service credentials) lives in secrets.toml */
export const KajaConfigSchema = z.object({
  stt: KajaSttSchema.optional(),
  tts: KajaTtsSchema.optional(),
  memory: KajaMemorySchema.optional(),
  marketplace: KajaMarketplaceSchema.optional().describe("Fetching abilities from the online marketplace"),
  context: KajaContextSchema.optional().describe("Keeping long conversations inside the model's context window"),
  tools: KajaToolsSchema.optional().describe("Where abilities' tools run"),
  preferences: KajaPreferencesSchema.optional().describe("In-app preferences")
})

export type KajaConfig = z.infer<typeof KajaConfigSchema>
export type KajaPreferences = z.infer<typeof KajaPreferencesSchema>
export type KajaStt = z.infer<typeof KajaSttSchema>
export type KajaTts = z.infer<typeof KajaTtsSchema>
export type KajaMemory = z.infer<typeof KajaMemorySchema>
export type KajaMarketplace = z.infer<typeof KajaMarketplaceSchema>
export type KajaContext = z.infer<typeof KajaContextSchema>
export type KajaTools = z.infer<typeof KajaToolsSchema>
export type ToolHost = z.infer<typeof ToolHostSchema>
