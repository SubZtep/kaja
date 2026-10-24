import { type KajaPreferences, PREFERENCE_DEFAULTS } from "@kaja/schema/config"

/**
 * In-app preferences (thinking/toolDisplay/voice/hotkeyModifier/theme), read once from the config file at
 * startup. Only the theme changes in-app (see useTheme); edit settings.toml directly and restart to change the rest.
 */
export function usePreferences(initial?: KajaPreferences) {
  return {
    thinking: initial?.thinking ?? PREFERENCE_DEFAULTS.thinking,
    toolDisplay: initial?.toolDisplay ?? PREFERENCE_DEFAULTS.toolDisplay,
    codePreviewLines: initial?.codePreviewLines ?? PREFERENCE_DEFAULTS.codePreviewLines,
    // Spoken replies are opt-in: they need the speaches TTS server running.
    voice: initial?.voice ?? PREFERENCE_DEFAULTS.voice,
    hotkeyModifier: initial?.hotkeyModifier ?? PREFERENCE_DEFAULTS.hotkeyModifier,
    yolo: initial?.yolo ?? PREFERENCE_DEFAULTS.yolo,
    // The starting theme: "auto" is resolved before render (lib/terminal-background.ts); left unresolved it means dark
    theme: initial?.theme === "light" ? ("light" as const) : ("dark" as const)
  }
}
