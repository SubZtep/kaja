---
layout: page
title: Config
parent: Configuration
nav_order: 3.1
---

# Config

`settings.json` selects which model entries in `models.toml` handle each task and configures local settings.

All model tasks are optional. Omitting `models.chat` falls back to the free hosted chat tier; embedding, rerank, image-generation, text-to-speech and speech-to-text are enabled by adding the appropriate model ids.

Example:

```json
{
  "models": { "chat": "chat-default" },
  "preferences": {
    "thinking": false,
    "sounds": true,
    "voice": false,
    "language": "en",
    "persona": "default"
  }
}
```

Fields:

- `models`: mapping from task name (`chat`, `embedding`, `image-generation`, etc.) to a `[[models]].id` from `models.toml`.
- `preferences.thinking`: show a ``thinking``/generating indicator when the agent is composing.
- `preferences.sounds`: play UI sounds.
- `preferences.voice`: enable spoken replies when a TTS model is configured.
- `preferences.language`: `en` or `hu` (affects local UI, not model behavior).
- `preferences.persona`: default persona id to open the CLI with.

Notes:

- To enable TTS/STT, add corresponding `models` entries in `models.toml` and a `stt`/`tts` block in `settings.json` (see the Voice page).
- `settings.json` is written by the setup wizard on first run; you can edit it manually afterwards.
