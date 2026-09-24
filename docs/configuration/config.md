---
layout: page
title: Settings
parent: Configuration
nav_order: 1
---

# settings.toml

Install-wide preferences. Which model handles each task lives in [`models.toml`](/configuration/models)
instead.

```toml
[preferences]
mode = "local"
locale = "en-GB"
thinking = false
sounds = true
voice = false
# hotkeyModifier = "alt"
# theme = "auto"

# [marketplace]
# enabled = true
# autoFetch = true

# [stt]
# speachesUrl = "ws://localhost:8000"
# language = "en"

# [tts]
# speachesUrl = "http://localhost:8000"
# voice = "af_heart"

# [memory]
# dbPath = "/home/user/.local/share/kaja/memory.sqlite"
```

## `[preferences]`

| Field | Purpose |
| --- | --- |
| `mode` | `local` or `cloud` — what a plain `kaja` starts; see [Cloud or local](/modes#which-mode-a-launch-uses) |
| `locale` | `en-GB`, `hu-HU`, `nan-TW` or `zh-TW` — the UI and the assistant's replies ([Language](/voice#language)) |
| `thinking` | show the model's reasoning while it generates |
| `sounds` | play UI sounds |
| `voice` | speak replies aloud (needs a `[models.tts]` entry) |
| `hotkeyModifier` | `alt` (default) or `ctrl` — the [key bar](/tui#key-bar)'s modifier |
| `theme` | `auto` (default), `dark` or `light` — the [colours](/tui#colours); `auto` matches the terminal |

## `[marketplace]`

| Field | Purpose |
| --- | --- |
| `enabled` | `false` means Kaja never goes online for abilities: `kaja abilities update` refuses and nothing is fetched. What's already in `marketplace/` still loads. Default `true`. |
| `autoFetch` | pull the [marketplace](/abilities) in the background at startup when the last sync is over a day old, silently on failure; changes apply on the next launch. Default `true`. |

## `[stt]` / `[tts]`

The speech server's URL and options — see [Voice](/voice). The models themselves are in `models.toml`.

## `[memory]`

`dbPath` overrides where the [SQLite file](/configuration/storage) lives. Leave it out and Kaja uses
the XDG data directory.

---

Next:

[Models](/configuration/models){: .btn .btn-green .fs-5 }
