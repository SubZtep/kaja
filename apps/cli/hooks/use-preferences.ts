import { useState } from "react"
import { savePreferences } from "../lib/config/config"
import { log } from "../lib/logger"
import type { KajaPreferences } from "../schemas/config"

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
