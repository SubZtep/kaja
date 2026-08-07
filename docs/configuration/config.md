---
layout: page
title: Config
parent: Configuration
nav_order: 3.1
---

# Config

`settings.toml` selects which model entries in `models.toml` handle each task and configures local settings.

All model tasks are optional. Omitting `models.chat` falls back to the free hosted chat tier; embedding, rerank, image-generation, text-to-speech and speech-to-text are enabled by adding the appropriate model ids.

Example:

```toml
[models.chat]
model = "chat-default"

[preferences]
thinking = false
sounds = true
voice = false
language = "en"
persona = "default"
```

Fields:

- `models`: mapping from task name (`chat`, `embedding`, `image-generation`, etc.) to a `[[models]].id` from `models.toml`.
- `preferences.thinking`: show a ``thinking``/generating indicator when the agent is composing.
- `preferences.sounds`: play UI sounds.
- `preferences.voice`: enable spoken replies when a TTS model is configured.
- `preferences.language`: `en` or `hu` (affects local UI, not model behavior).
- `preferences.persona`: default persona id to open the CLI with.

Notes:

- To enable TTS/STT, add corresponding `models` entries in `models.toml` and a `stt`/`tts` block in `settings.toml` (see the Voice page).
- `settings.toml` is written by the setup wizard on first run; you can edit it manually afterwards.

## `kaja config fetch`

Downloads `mcp.toml` and `models.toml` from a Kaja server, backing up any existing files first:

```sh
kaja config fetch
```

Set `services.toml`'s `[api]` `baseUrl` (and `token` if required) before running this.
On a fresh install, the fetched `models.toml`'s first `chat`-task model is also auto-filled into
`settings.toml`'s `models.chat`, so a single fetch is enough to leave a fresh install bootable (a
chat model you've deliberately chosen is never overwritten by a later fetch).

## `kaja config wipe`

Backs up the whole config directory (`settings.toml`, `models.toml`, `mcp.toml`, `services.toml`,
`tools/`, `personas/`, `datasets/`) by renaming it to `<dir>.bak` (or `.bak2`, `.bak3`, ... if
backups already exist), leaving a clean slate for the next run of `kaja` to recreate:

```sh
kaja config wipe
```

Nothing is ever deleted — recover by renaming the `.bak` directory back if needed.

---

Next:

[Models](/configuration/models){: .btn .btn-green .fs-5 }
