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

# [context]
# compact_at = 0.8

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
| `voice` | speak replies aloud (needs a `tts` model in `models.toml`'s `[tasks]`) |
| `hotkeyModifier` | `alt` (default) or `ctrl` — the [key bar](/tui#key-bar)'s modifier |
| `theme` | `auto` (default), `dark` or `light` — the [colours](/tui#colours); `auto` matches the terminal |

## `[marketplace]`

| Field | Purpose |
| --- | --- |
| `enabled` | `false` means Kaja never goes online for abilities: `kaja abilities update` refuses and nothing is fetched. What's already in `marketplace/` still loads. Default `true`. |
| `autoFetch` | pull the [marketplace](/abilities) in the background at startup when the last sync is over a day old, silently on failure; changes apply on the next launch. Default `true`. |

## `[context]`

| Field | Purpose |
| --- | --- |
| `compact_at` | how full the chat model's [context window](/configuration/models) may get, from `0.3` to `0.95`, before the older messages are summarised so the conversation fits. Default `0.8`. |

Once the context gets that full, the older messages are summarised and the model carries on from the
summary plus the most recent turns, word for word. The chat shows a line each time, like
`Context compacted: 26,000 → 4,000 tokens`. Nothing is deleted: the whole conversation stays saved. If the
summary can't be written, the oldest messages are left out instead, and the line says so.

`/compact` does it on demand and keeps only your latest turn word for word; add what to keep in mind to
steer it: `/compact keep the SQL decisions`.

A single tool result bigger than a quarter of the window (a long web page, a large file) is condensed before
the model sees it, in parts when it's more than the summarising model can take in at once. The terminal
shows a line such as `fetch_url output condensed: 40,000 → 2,000 tokens`. The full output stays in the
saved conversation.

Images (a screenshot a tool took, say) are sent to the model for your latest two messages; older ones are
replaced by a short note, since resending them every time costs a lot. They stay in the saved conversation.

The summaries are written by the model `models.toml`'s `[tasks]` picks for `summarize` (a smaller, cheaper
model works well), else by the chat model. The `summarize` tool uses the same model.

## `[stt]` / `[tts]`

The speech server's URL and options — see [Voice](/voice). The models themselves are in `models.toml`.

## `[memory]`

`dbPath` overrides where the [SQLite file](/configuration/storage) lives. Leave it out and Kaja uses
the XDG data directory.

---

Next:

[Models](/configuration/models){: .btn .btn-green .fs-5 }
