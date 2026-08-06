---
layout: page
title: Voice
nav_order: 4.4
---

# Voice (TTS / STT)

Mic dictation and spoken replies run through a [Speaches AI](https://github.com/speaches-ai/speaches) server by default, but any compatible STT/TTS provider can be configured via `models.toml` and `services.toml`.

To enable voice features:

1. Add a `models` entry in `models.toml` for `task = "text-to-speech"` and/or `task = "speech-to-text"`.
2. Add a `stt` and/or `tts` block to `config.json` with the `speachesUrl` or provider-specific settings.

Example notes:

- `models.text-to-speech` in `config.json` should reference an `[[models]].id` that has `task = "text-to-speech"`.
- `Ctrl+T` toggles dictation while typing in the CLI.

See `config/config.md` for the `config.json` format and `models.md` for declaring TTS/STT models.
