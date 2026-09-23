---
layout: page
title: Voice & language
parent: Using Kaja
nav_order: 5
---

# Voice & language

## Voice

Mic dictation and spoken replies work in [local mode](/modes#local-mode), through a
[Speaches AI](https://github.com/speaches-ai/speaches) server by default. Any compatible STT/TTS
provider works: the model goes in `models.toml`, the endpoint in `settings.toml`. Ticking Speaches in
the [setup wizard](/wizard) writes both for you.

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

   Dictation uses the realtime WebSocket API (`ws://`) and spoken replies plain HTTP, which is why the
   two URLs differ in scheme.

Then `Ctrl+T` toggles dictation while typing, and `preferences.voice = true` reads replies aloud.

## Language

The interface and the assistant's replies follow `preferences.locale`: `en-GB`, `hu-HU` (Magyar),
`nan-TW` or `zh-TW` (繁體中文). The wizard asks for it first; with no saved value the system locale
decides (Hungarian picks Magyar, anything else English). In cloud mode the web app follows the same
four languages.

Voice lags behind:

- **Dictation** needs a multilingual Whisper model. The default above is English-only: point
  `[models.stt]` at a multilingual model and set `stt.language`.
- **Spoken replies** use the configured Kokoro voice, which has no Hungarian, unless `[models.tts]`
  points at something that does.

---

Next:

[Abilities](/abilities){: .btn .btn-green .fs-5 }
