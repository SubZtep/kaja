---
layout: page
title: Config
parent: Configuration
nav_order: 4.1
---

# Config

`config.json` selects which model entries in `models.toml` handle each task and configures local settings.

All model tasks are optional. Omitting `models.chat` falls back to the free hosted chat tier; embedding, rerank, image-generation, text-to-speech and speech-to-text are enabled by adding the appropriate model ids.

Example:

```json
{
  "models": { "chat": "chat-default" },
  "settings": {
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
- `settings.thinking`: show a ``thinking``/generating indicator when the agent is composing.
- `settings.sounds`: play UI sounds.
- `settings.voice`: enable spoken replies when a TTS model is configured.
- `settings.language`: `en` or `hu` (affects local UI, not model behavior).
- `settings.persona`: default persona id to open the CLI with.

Notes:

- To enable TTS/STT, add corresponding `models` entries in `models.toml` and a `stt`/`tts` block in `config.json` (see the Voice page).
- `config.json` is written by the setup wizard on first run; you can edit it manually afterwards.
