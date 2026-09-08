---
layout: page
title: Voice
parent: Configuration
nav_order: 4.5
---

# Voice (TTS / STT)

Mic dictation and spoken replies run through a
[Speaches AI](https://github.com/speaches-ai/speaches) server by default. Any compatible STT/TTS
provider works — the model goes in `models.toml`, the endpoint in `settings.toml`.

[Local mode](/modes) only.

## Setup

1. Run a Speaches server (or equivalent).
2. Declare the models in [`models.toml`](/configuration/models):

   ```toml
   [providers.speaches]
   base_url = "http://localhost:8000"

   [models.tts]
   model = "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16"
   task = "tts"
   provider = "speaches"

   [models.stt]
   model = "Systran/faster-distil-whisper-small.en"
   task = "stt"
   provider = "speaches"
   ```

3. Point [`settings.toml`](/configuration/config) at the server:

   ```toml
   [stt]
   speachesUrl = "ws://localhost:8000"
   language = "en"

   [tts]
   speachesUrl = "http://localhost:8000"
   voice = "af_heart"
   ```

STT uses the realtime WebSocket API (`ws://`), TTS plain HTTP — that's why the two `speachesUrl`
values can differ in scheme.

## Using it

- `Ctrl+T` toggles mic dictation while typing.
- Spoken replies follow `preferences.voice`, togglable from the [`/` menu](/tui#the--menu).

## Language

The UI and the assistant's replies follow `preferences.language`: `en-GB`, `hu` (Magyar), or
`nan-TW`. It's read once at startup; with no saved value the system locale decides (a Hungarian
locale picks Magyar, anything else falls back to English).

Voice lags behind the UI languages:

- **Dictation** needs a multilingual Whisper model. The usual English default is English-only —
  point `[models.stt]` at a multilingual entry and set `stt.language` to override the hint.
- **Spoken replies** stay with the configured Kokoro voice, which has no Hungarian, unless
  `[models.tts]` points at something that does.

---

Next:

[Terminal UI](/tui){: .btn .btn-green .fs-5 }
