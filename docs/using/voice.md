---
layout: page
title: Voice & language
parent: Using Kaja
nav_order: 5
---

# Voice & language

> Voice is a work in progress 🐞 — expect rough edges.
{: .warning }

## Voice

Mic dictation and spoken replies work in [local mode](/getting-started/modes#local-mode), through a
[Speaches AI](https://github.com/speaches-ai/speaches) server by default. Any compatible STT/TTS
provider works: the model goes in `models.toml`, the endpoint in `settings.toml`. Ticking Speaches in
the [setup wizard](/getting-started/wizard) writes both for you.

1. Run a Speaches server (or equivalent).
2. Declare the models in [`models.toml`](/configuration/models):

   ```toml
   [providers.speaches]
   base_url = "http://localhost:8000"

   [tasks]
   tts = "kokoro-82m-v1-0-onnx-fp16"
   stt = "faster-distil-whisper-small-en"

   [models.kokoro-82m-v1-0-onnx-fp16]
   model = "speaches-ai/Kokoro-82M-v1.0-ONNX-fp16"
   provider = "speaches"
   tasks = ["tts"]

   [models.faster-distil-whisper-small-en]
   model = "Systran/faster-distil-whisper-small.en"
   provider = "speaches"
   tasks = ["stt"]
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

The interface and the assistant's replies follow `preferences.locale`: `en-GB` (British English), `en-US`
(American English), `hu-HU` (Magyar), `nan-TW` (臺語, Taiwanese Hokkien) or `zh-TW` (繁體中文). The wizard
asks for it first; with no saved value the system locale decides (`LC_ALL`, `LC_MESSAGES` or `LANG`): a US
English, Hungarian, Taiwanese Hokkien or Traditional Chinese locale picks that language, anything else
British English. In cloud mode your account's language is used, and the web app offers the same five.

Voice lags behind:

- **Dictation** needs a multilingual Whisper model. The default above is English-only: point `stt` in
  `[tasks]` at a multilingual model and set `stt.language`.
- **Spoken replies** use the configured Kokoro voice, which has no Hungarian, unless `tts` in `[tasks]`
  points at something that does.

---

Next:

[Abilities](/abilities){: .btn .btn-green .fs-5 }
