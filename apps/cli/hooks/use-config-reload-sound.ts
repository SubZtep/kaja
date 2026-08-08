import { useEffect } from "react"
import { playSound } from "../lib/audio/sounds"
import { configChangedEvents } from "../lib/config/config-watcher"

/** Plays a confirmation bell whenever an external edit to settings.toml/services.toml/secrets.toml is picked up live (config-watcher.ts), so a hand-edit while kaja is running has an audible confirmation instead of a silent effect. */
export function useConfigReloadSound(enabled = true) {
  useEffect(() => {
    const onChanged = () => {
      if (enabled) playSound("bell")
    }
    configChangedEvents.addEventListener("changed", onChanged)
    return () => configChangedEvents.removeEventListener("changed", onChanged)
  }, [enabled])
}
