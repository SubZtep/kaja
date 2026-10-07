import type { KajaPreferences } from "@kaja/schema/config"

/**
 * In-app preferences (thinking/toolDisplay/sounds/voice/hotkeyModifier/theme), read once from
 * the config file at startup. Only the theme changes in-app (see useTheme); edit
 * settings.toml directly and restart to change the rest.
 */
export function usePreferences(initial?: KajaPreferences) {
  return {
    thinking: initial?.thinking ?? false,
    toolDisplay: initial?.toolDisplay ?? "minimal",
    codePreviewLines: initial?.codePreviewLines ?? 5,
    sounds: initial?.sounds ?? true,
    // Spoken replies are opt-in: they need the speaches TTS server running.
    voice: initial?.voice ?? false,
    hotkeyModifier: initial?.hotkeyModifier ?? "alt",
    yolo: initial?.yolo ?? false,
    // The starting theme: "auto" is resolved before render (lib/terminal-background.ts); left unresolved it means dark
    theme: initial?.theme === "light" ? ("light" as const) : ("dark" as const)
  }
}
