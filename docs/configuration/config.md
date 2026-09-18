---
layout: page
title: Settings
parent: Configuration
nav_order: 4.1
---

# settings.toml

Local, install-wide preferences. Which model handles each task lives in
[`models.toml`](/configuration/models) instead.

```toml
[preferences]
thinking = false
sounds = true
voice = false
locale = "en-GB"
persona = "default"

# Speech-to-text (Speaches AI server).
# [stt]
# speachesUrl = "http://localhost:8000"
# language = "en"

# Text-to-speech (Speaches AI server).
# [tts]
# speachesUrl = "http://localhost:8000"
# voice = "af_heart"

# Overrides the default XDG data location for the memory database.
# [memory]
# dbPath = "/home/user/.local/share/kaja/memory.sqlite"
```

## `[preferences]`

| Field | Purpose |
| --- | --- |
| `thinking` | show the model's reasoning while it generates |
| `sounds` | play UI sounds |
| `voice` | speak replies aloud (needs a `[models.tts]` entry) |
| `locale` | `en-GB`, `hu-HU`, or `nan-TW` — affects the UI and the assistant's replies |
| `persona` | persona id to open with |

The first four are also togglable at runtime from the `/` menu, which writes the change back to
this file. `locale` is read once at startup; with no saved value the system locale decides.

## `[stt]` / `[tts]`

Voice endpoints — see [Voice](/configuration/voice). The *models* for these tasks are declared in
`models.toml`; these blocks hold the server URL and per-feature options.

## `[memory]`

`dbPath` overrides where the SQLite file lives. Omit it and Kaja uses the XDG data directory. See
[Storage](/tui/sqlite) for what's in that file.

## Config subcommands

### `kaja config paths`

Prints a table of every config file and where it resolves on this machine. Start here when you're
not sure which file Kaja is actually reading.

### `kaja config fetch`

Rewrites `mcp.toml`, `models.toml`, `secrets.toml`, and the shipped personas from the templates
bundled with your Kaja binary, backing up any existing file that differs (an unchanged file is left
alone). `secrets.toml` always comes from the bundled template — the server has no user secrets to
export, so it's never part of the admin-managed bundle `fetch` otherwise downloads.

```sh
kaja config fetch
```

Use it to pick up new template defaults after an upgrade, or to recover a file you've broken. Your
`settings.toml` and `services.toml` are never touched.

---

Next:

[Models](/configuration/models){: .btn .btn-green .fs-5 }
