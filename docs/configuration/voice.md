---
layout: page
title: Voice
parent: Configuration
nav_order: 3.5
---

# Voice (TTS / STT)

Mic dictation and spoken replies run through a [Speaches AI](https://github.com/speaches-ai/speaches) server by default, but any compatible STT/TTS provider can be configured via `models.toml` and `services.toml`.

To enable voice features:

1. Add a `[models.tts]` and/or `[models.stt]` entry in `models.toml`.
2. Add a `stt` and/or `tts` block to `settings.toml` with the `speachesUrl` or provider-specific settings.

Example notes:

- `Ctrl+T` toggles dictation while typing in the CLI.

See `config/config.md` for the `settings.toml` format and `models.md` for declaring TTS/STT models.

## Language

English or Magyar, covering the UI and the assistant's replies, saved as `preferences.language` in
`settings.toml` and read once at startup; without a saved choice the system locale decides (a
Hungarian locale → Magyar, anything else → English).

Voice caveat for Hungarian: dictation needs the multilingual whisper model on the STT server (the
English default is an English-only model — point `models.toml`'s `[models.stt]` at a
multilingual entry, and set `stt.language` in `settings.toml` to override), and spoken replies
stay with the configured Kokoro voice (no Hungarian voice) unless `[models.tts]`
points at something Hungarian-capable.

---

Next:

[CLI](/cli){: .btn .btn-green .fs-5 }
