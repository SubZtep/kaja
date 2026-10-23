---
layout: page
title: Settings
parent: Configuration
nav_order: 2
summary: "settings.toml: preferences, voice, marketplace and storage."
icon: ⚙️
---

# settings.toml

Install-wide preferences. Which model handles each task lives in [`models.toml`](/config/models).

```toml
[preferences]
mode = "local"
locale = "en-GB"
thinking = false
# toolDisplay = "minimal"
# codePreviewLines = 5
voice = false
# hotkeyModifier = "alt"
# theme = "auto"
# yolo = false

# [marketplace]
# enabled = true
# autoFetch = true

# [context]
# compact_at = 0.8

# [tools.hosts]
# chrome-devtools = "sandbox"
# shell = "computer"

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

| Field              | Purpose                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`             | `local` or `cloud`: what a plain `kaja` starts. See [Cloud or local](/start/modes#which-mode-a-launch-uses)                                                                                                                                                                                                                                       |
| `locale`           | `en-GB`, `en-US`, `hu-HU`, `nan-TW` or `zh-TW`: the UI and the assistant's replies ([Language](/use/voice#language))                                                                                                                                                                                                                              |
| `thinking`         | show the model's reasoning while it generates                                                                                                                                                                                                                                                                                                     |
| `toolDisplay`      | `minimal` (default), `verbose` or `corner`: how [tool calls](/use/tui#tool-calls) show                                                                                                                                                                                                                                                            |
| `codePreviewLines` | default `5`: lines of a code block or approval command shown before it is cut; `<modifier>+E` shows all                                                                                                                                                                                                                                           |
| `voice`            | speak replies aloud (needs a model listing `tts` in `models.toml`)                                                                                                                                                                                                                                                                                |
| `hotkeyModifier`   | `alt` (default) or `ctrl`: the [key bar](/use/tui#key-bar)'s modifier                                                                                                                                                                                                                                                                             |
| `theme`            | `auto` (default), `dark`, `light` or `terminal`: the [colours](/use/tui#colours). `auto` picks dark or light to match the terminal; `terminal` uses the terminal's own colour scheme                                                                                                                                                              |
| `yolo`             | **dangerous**, for development: `true` approves every shell command and tool call without asking, risky ones such as `sudo` or `rm -rf` included, in the chat, the local Telegram bot and the cloud chat's tool approvals. Kaja's hard limits (read-only folders, files `read_file` never opens) still hold. A red YOLO badge shows while it's on |

## `commands.toml`: commands that run without asking

The agent asks before it runs a shell command, except for the simple read-only ones on the safe list.
`commands.toml` holds that list as regexes, each of which must match the whole command:

```toml
safe = ['pwd', 'git (status|diff|log)(\s+[\w./=:@^~-]+)*', '...']  # a couple of the defaults; `kaja config fetch` refreshes them
custom = ['npm (test|run lint)']                            # yours, kept when the defaults are refreshed
```

A command with a shell metacharacter (`; & | $ ( ) { } < >`, a backtick or a newline) always asks, and so
does anything flagged as dangerous (`rm -rf`, `sudo`, a force push, ...), whatever the patterns say. A
pattern that isn't a valid regex is skipped with a warning. The list applies to the local TUI and to
`kaja telegram`; the cloud agent never runs shell commands.

## `hooks.toml`: commands that run on chat events

Optional: Kaja works without it. `kaja config hooks` (also a step of the [setup wizard](/start/wizard))
looks for a sound player, a notification tool and a speech tool on your computer, asks what to switch on, downloads
the sound effects into Kaja's data folder and writes this file. Without it nothing makes a sound.

Each `[[event]]` table starts one shell command in the background (Kaja never waits for it) when that happens in the
chat, in local and cloud mode. Several tables of the same event run side by side:

```toml
[[message]]                                              # the assistant wrote in the chat
run = "espeak-ng --stdin"                                # read it aloud...
cancel = "speech"                                        # ...cutting off the reply still being read

[[message]]
run = 'paplay "$KAJA_SOUNDS/hehe.wav"'                   # and play a sound

[[question]]                                             # Kaja asks you a question
run = 'notify-send -- "$KAJA_TITLE" "$KAJA_TEXT"'        # show a notification
```

| Event            | When                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------- |
| `message`        | the assistant wrote in the chat (a reply that merely ends in a question mark counts)   |
| `question`       | Kaja stops to ask you something                                                        |
| `confirm`        | a shell command or tool call waits for your approval                                   |
| `reasoning`      | the assistant is thinking                                                              |
| `tool_call`      | the assistant calls a tool                                                             |
| `notice`         | the chat shows a notice, like a condensed conversation                                 |
| `persona_switch` | the persona changed                                                                    |
| `error`          | something went wrong                                                                   |
| `copy`           | a message was copied to the clipboard                                                  |
| `login_code`     | the browser couldn't be opened for sign-in, so the code went to your clipboard instead |

In the command, `$KAJA_TEXT` is what happened as plain text without Markdown (also on stdin), `$KAJA_TITLE` a short
title for notifications, `$KAJA_SOUNDS` the folder of sound effects (`bell.wav`, `magic.wav`, `wind.wav`, `hehe.wav`,
`error.wav`, `keyboard.wav`; see `kaja config paths`) and `$KAJA_HOOK` the event's name.

`cancel = true` stops a still-running earlier run of the same command before the new one starts; `cancel = "name"` does
that for every command sharing the name, so two `espeak-ng` never talk over each other. A command that fails is only
logged (see [Logs](/config/commands#logs)), and one still running when you quit carries on. A session you resume
doesn't replay its old messages, and `kaja telegram` has no hooks.

`kaja config hooks` knows `paplay`, `pw-play`, `ffplay`, `mpv`, `play` and `aplay` for sounds, `notify-send` and
`kdialog` for notifications and `espeak-ng`, `espeak` and `spd-say` for speech on Linux, `afplay`, `osascript` and
`say` on macOS, and PowerShell on Windows. When one is missing it prints the command that installs it.

## `[marketplace]`

| Field       | Purpose                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`   | `false` means Kaja never goes online for abilities: `kaja abilities update` refuses and nothing is fetched. What's already in `marketplace/` still loads. Default `true`    |
| `autoFetch` | pull the [marketplace](/abilities) in the background at startup when the last sync is over a day old, silently on failure. Changes apply on the next launch. Default `true` |
| `url`       | the git URL (or local path) of the repo whose `marketplace/` folder `kaja abilities update` fetches: a fork, or a checkout with your changes. Default the Kaja repo         |
| `ref`       | the branch or tag to fetch. Default `main`                                                                                                                                  |

## `[tools.hosts]`

Where each `stdio` [MCP ability](/abilities/mcp) runs, by name: `computer` (this machine) or `sandbox` (a
Kaja sandbox). The default follows the loop: local mode runs it here, cloud mode on a sandbox.

- **Local mode**, `sandbox`: a [Kaja sandbox](/abilities/mcp#on-a-sandbox-from-local-mode), reached through
  the Kaja API. It needs a cloud sign-in (`kaja login`); signed out, those abilities are off and the chat
  says so. Network tools (`fetch_url`, HTTP tools, remote MCP servers) always run here.
- **Cloud mode**, `computer`: your terminal runs it for cloud chat
  ([Your computer in cloud mode](/start/modes#your-computer-in-cloud-mode)). Local-only abilities
  and your own always run here anyway.
- `shell = "computer"` lets cloud chat use your shell (`run_command`), asking first unless
  [`commands.toml`](/config/commands) lists the command as safe. Off by default.

## `[context]`

| Field        | Purpose                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `compact_at` | how full the chat model's [context window](/config/models) may get, from `0.3` to `0.95`, before older messages are summarised. Default `0.8` |

Past that point, the older messages are summarised, and the model carries on from the summary plus the most
recent turns, word for word. The chat shows a line each time, like `Context compacted: 26,000 → 4,000
tokens`. Nothing is deleted, and the whole conversation stays saved. If the summary can't be written, the
oldest messages are left out instead, and the line says so.

`/compact` does it on demand and keeps only your latest turn word for word. Add what to keep:
`/compact keep the SQL decisions`.

A single tool result bigger than a quarter of the window (a long web page, a large file) is condensed before
the model sees it, in parts if it's more than the summarising model can take in at once. The terminal shows
a line like `fetch_url output condensed: 40,000 → 2,000 tokens`, and the full output stays in the saved
conversation.

Images (say, a screenshot a tool took) are sent to the model for your latest two messages. Older ones
become a short note, since resending them every time costs a lot. They stay in the saved conversation.

Summaries are written by the first model in `models.toml` that lists `summarize` (a smaller, cheaper one
works well), or else the chat model. The `summarize` tool uses the same model.

## `[stt]` / `[tts]`

The speech server's URL and options, see [Voice](/use/voice). The models themselves are in `models.toml`.

## `[memory]`

`dbPath` overrides where the [SQLite file](/config/storage) lives. Leave it out for the XDG data
folder.

---

Next:

[Models](/config/models){: .btn .btn-green .fs-5 }
