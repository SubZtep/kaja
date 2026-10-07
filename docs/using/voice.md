---
layout: page
title: Voice & language
parent: Using Kaja
nav_order: 5
summary: "Talk to Kaja and hear it back, in your language."
icon: 🎙️
---

# Voice & language

> Voice is a work in progress 🐞 Expect rough edges.
{: .warning }

## Voice

Mic dictation and spoken replies work in [local mode](/getting-started/modes#local-mode), by default through
a [Speaches AI](https://github.com/speaches-ai/speaches) server. Any compatible STT/TTS provider works:
the models go in `models.toml`, the endpoint in `settings.toml`. Ticking Speaches in the
[setup wizard](/getting-started/wizard) writes both.

1. Run a Speaches server (or an equivalent).
2. Declare the models in [`models.toml`](/configuration/models):

   ```toml
   [providers.speaches]
   base_url = "http://localhost:8000"

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

   Dictation uses the realtime WebSocket API (`ws://`) and spoken replies use plain HTTP, hence the two
   schemes.

Then `Ctrl+T` toggles dictation while you type, and `preferences.voice = true` reads replies aloud.

## Language

The interface and the assistant's replies follow `preferences.locale`:

| Code | Language |
| --- | --- |
| `en-GB` | British English |
| `en-US` | American English |
| `hu-HU` | Magyar |
| `nan-TW` | 臺語 (Taiwanese Hokkien) |
| `zh-TW` | 繁體中文 |

The wizard asks first. With no saved value, your system locale decides (`LC_ALL`, `LC_MESSAGES` or `LANG`),
and anything unsupported becomes British English. In cloud mode your account's language is used, and the
web app offers the same five.

Voice lags behind:

- **Dictation** needs a multilingual Whisper model. The default above is English-only, so put a multilingual one
  that lists `stt` above it and set `stt.language`.
- **Spoken replies** use the configured Kokoro voice, which has no Hungarian. Put a `tts` model that does
  above it.

---

Next:

[Abilities](/abilities){: .btn .btn-green .fs-5 }
