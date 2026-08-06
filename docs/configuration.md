---
layout: page
title: Configuration
nav_order: 4
---

# Configuration

Everything lives in `~/.config/kaja/`. Run `kaja --config` to print (and copy) the path to
`config.json`. Templates for all of these ship in
[`docs/config/`](https://github.com/SubZtep/kaja/tree/main/docs/config) — the setup wizard
writes them out on first run.

```
~/.config/kaja/
├── config.json      # active model ids + app settings
├── models.toml      # provider credentials + model definitions
├── mcp.toml         # MCP servers
├── services.toml    # external service credentials
├── personas/*.toml  # persona definitions
└── tools/*.ts       # your own local tool plugins (optional)
```

## config.json

Picks which `models.toml` id handles each task. Only `models.chat` is required — embedding,
rerank, image-generation, text-to-speech and speech-to-text are opt-in.

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

`settings`: `thinking` (show generating indicator), `sounds`, `voice` (spoken replies),
`language` (`en` or `hu`), `persona` (which persona to open with).

## models.toml

Any OpenAI-compatible API. Credentials live once per `[providers.*]` table; each `[[models]]`
picks one with `provider = "<name>"` (defaults to `[providers.default]`). `id` is the slug
`config.json` points at, `model` is what's sent to the provider, `task` is one of `chat`,
`embedding`, `rerank`, `image-generation`, `text-to-speech`, `speech-to-text`.

```toml
[providers.default]
base_url = "http://localhost:11434/v1"
api_key = "ollama"  # required but ignored by Ollama

[[models]]
id = "chat-default"
model = "llama3.2:1b"
task = "chat"
```

The shipped templates cover local Ollama (`llama3.2:1b`, `qwen2.5:0.5b`, `qwen3:1.7b`,
`llama3.2:3b`) and hosted Fireworks. To switch models later, edit `models.toml` and update the
relevant `models.<task>` id in `config.json`.

## services.toml

Each section is optional — omit one and that feature is unavailable.

```toml
# Base URL of a Kaja server, used by `kaja config fetch`.
[api]
baseUrl = "https://api.kaja.io"

# Geo lookup for the location tool (IP → city/country).
[location]
serviceUrl = "https://ip2geo.demo.land/"
apiKey = "kaja"

# Brave Search API key for the web_search tool.
[webSearch]
apiKey = "BSA..."

# Telegram bot — see the Telegram page.
[telegram]
botToken = "123456:ABC-DEF..."
allowedUserIds = [123456789]
```

## Voice

Mic dictation and spoken replies run through a
[Speaches AI](https://github.com/speaches-ai/speaches) server. Add `stt`/`tts` blocks to
`config.json` with a `speachesUrl`, plus a `models.text-to-speech` entry for spoken output.
**`Ctrl+T`** toggles dictation while typing.
