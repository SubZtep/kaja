import type { KajaPreferences } from "@kaja/schema/config"

/**
 * In-app preferences (thinking/sounds/voice/hotkeyModifier/theme), read once from
 * the config file at startup. Not toggleable in-app — edit settings.toml
 * directly and restart to change them.
 */
export function usePreferences(initial?: KajaPreferences) {
  return {
    thinking: initial?.thinking ?? false,
    sounds: initial?.sounds ?? true,
    // Spoken replies are opt-in: they need the speaches TTS server running.
    voice: initial?.voice ?? false,
    hotkeyModifier: initial?.hotkeyModifier ?? "alt",
    // "auto" is resolved before render (lib/terminal-background.ts); left unresolved it means dark
    theme: initial?.theme === "light" ? ("light" as const) : ("dark" as const)
  }
}
