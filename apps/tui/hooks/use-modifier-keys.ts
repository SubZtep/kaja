import type { KajaPreferences } from "@kaja/schema/config"
import { useInput } from "ink"

export type HotkeyModifier = NonNullable<KajaPreferences["hotkeyModifier"]>

/**
 * Fires the matching handler on `<modifier>+<letter>`. No modifier is
 * universal in a terminal, so which one to use is user-configurable
 * (`preferences.hotkeyModifier` in settings.toml, defaulting to "alt"):
 * Alt (Ink's `key.meta`) can type special characters instead of acting as a
 * modifier on some macOS terminals (Terminal.app/iTerm2 without "Option as
 * Meta" enabled) — this app's own Alt+C (copy last answer) and Alt+Enter
 * (newline) already rely on it working, so it's a reasonable default. Ctrl
 * (`key.ctrl`) is the safer pick there, but can instead collide with
 * host-app global shortcuts (e.g. VS Code's integrated terminal reserves
 * several Ctrl+<letter> combos regardless of which panel has focus).
 */
export function useModifierKeys(modifier: HotkeyModifier, bindings: Partial<Record<string, () => void>>) {
  useInput((input, key) => {
    if (modifier === "ctrl" ? key.ctrl : key.meta) bindings[input]?.()
  })
}
