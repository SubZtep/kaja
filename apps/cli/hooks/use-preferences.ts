import type { KajaPreferences } from "@kaja/schema/config"
import { useEffect, useState } from "react"
import { savePreferences } from "../lib/config/config"
import { preferencesEvents } from "../lib/config/config-watcher"
import { log } from "../lib/logger"

/**
 * In-app preferences (thinking/sounds/voice), seeded from the config file and
 * written back on every toggle. With a live (non-Static) timeline, toggles
 * take effect on the next React render — no terminal wipe required.
 */
export function usePreferences(initial?: KajaPreferences) {
  const [thinking, setThinking] = useState(initial?.thinking ?? true)
  const [sounds, setSounds] = useState(initial?.sounds ?? true)
  // Spoken replies are opt-in: they need the speaches TTS server running.
  const [voice, setVoice] = useState(initial?.voice ?? false)

  // Picks up settings.toml hand-edited externally while this session is already running
  // (config-watcher.ts); toggle* below stays the source of truth for in-app changes.
  useEffect(() => {
    const onExternalChange = (event: Event) => {
      const preferences = (event as CustomEvent<KajaPreferences>).detail
      if (preferences.thinking !== undefined) setThinking(preferences.thinking)
      if (preferences.sounds !== undefined) setSounds(preferences.sounds)
      if (preferences.voice !== undefined) setVoice(preferences.voice)
    }
    preferencesEvents.addEventListener("preferences", onExternalChange)
    return () => preferencesEvents.removeEventListener("preferences", onExternalChange)
  }, [])

  const persist = (preferences: KajaPreferences) => {
    savePreferences(preferences).catch(error => {
      log.warn({ error }, "Failed to save preferences")
    })
  }

  const toggleThinking = () => {
    persist({ thinking: !thinking, sounds, voice })
    setThinking(!thinking)
  }

  const toggleSounds = () => {
    persist({ thinking, sounds: !sounds, voice })
    setSounds(!sounds)
  }

  const toggleVoice = () => {
    persist({ thinking, sounds, voice: !voice })
    setVoice(!voice)
  }

  return {
    thinking,
    sounds,
    voice,
    toggleThinking,
    toggleSounds,
    toggleVoice
  }
}
