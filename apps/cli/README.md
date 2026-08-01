# Kaja CLI  !¡ 🐓

Terminal chat with personas, tools, optional mic dictation, and optional TTS.

## Install

> [!NOTE]  
> Only tested on Linux.

```bash
curl -fsSL https://cli.kaja.io | bash
```

### Uninstall

```bash
rm ~/.local/bin/kaja
```

## Run

```bash
kaja
```

## Screenshots

![Kaja Startup Screen](./docs/pics/screenshot_02.png)
![Kaja Command Run](./docs/pics/screenshot_01.png)

## Config

No wizard — edit the files directly. First run writes template copies into
`~/.config/kaja/`:

* [`config.json`](docs/config/config.json) — `models` maps each task ( `chat`
  mandatory; `embedding` / `rerank` / `image-generation` / `text-to-speech` /
  `speech-to-text` optional) to a `models.toml` entry's `id`. Also holds
  `stt` / `tts` 's non-model settings (`speachesUrl`, `language`, `voice`),
  `memory.dbPath`, and in-app UI preferences under `settings`.
* [`models.toml`](docs/config/models.fireworks.toml) — Providers (credentials)
  and models (name + task + which provider). `config.json`'s `models.<task>`
  picks one by `id`. Fetch a server-managed copy with `kaja config fetch`, or
  edit by hand ([Fireworks](docs/config/models.fireworks.toml) /
  [Ollama](docs/config/models.ollama.toml) examples).
* [`services.toml`](docs/config/services.toml) — External service
  credentials: `[api]` (Kaja backend, used by `kaja config fetch`),
  `[location]` , `[webSearch]` , `[telegram]` . Every section is optional;
  leaving one out just disables that feature.
* [`mcp.toml`](docs/config/mcp.toml) — Model Context Protocol servers for the agent.
* [`personas/`](docs/config/personas) — Preconfigured agent behaviours, one
  `.toml` file per persona (filename minus extension is the persona id, e.g.
  `barkochba.toml` -> `barkochba`). Give a persona a `when` clause and Kaja
  switches to it on its own when the conversation calls for it.

### `kaja config fetch`

Downloads `mcp.toml` and `models.toml` from a Kaja server, backing up any
existing files first:

```bash
kaja config fetch --api-url http://localhost:3001
```

`--api-url` is only needed the first time — it's saved into
`services.toml` 's `[api]` section. On a fresh install, the fetched
`models.toml` 's first `chat`-task model is also auto-filled into
`config.json` 's `models.chat` , so a single fetch is enough to leave a fresh
install bootable (a chat model you've deliberately chosen is never
overwritten by a later fetch).

### Where to get credentials?

* **Chat model** (`models.chat`) : any OpenAI-compatible provider works (e.g. Ollama, Fireworks AI) — add it to `models.toml`.
* **Web search** (`services.toml` 's `[webSearch]`) : get a free key from [Brave's website](https://brave.com/search/api/).
* **Location** (`services.toml` 's `[location]`) : the example URL and API key work for a while.

### Language

English or Magyar, covering the UI and the assistant's replies, saved as
`settings.language` in `config.json` and read once at startup; without a
saved choice the system locale decides (a Hungarian locale → Magyar, anything
else → English).

Voice caveat for Hungarian: dictation needs the multilingual whisper model on
the STT server (the English default is an English-only model — point
`models.speech-to-text` at a multilingual entry in `models.toml`, and set
`stt.language` in `config.json` to override), and spoken replies stay with
the configured Kokoro voice (no Hungarian voice) unless `models.text-to-speech`
points at something Hungarian-capable.

## Personas

Each `.toml` under `~/.config/kaja/personas/` is one behaviour: a `label`, the
`instructions` that become the system prompt, and optionally a `model` to pin,
`dataset` to collect, and sampling params.

Switching is automatic. Add a `when` clause describing the persona's territory
and Kaja moves itself there mid-conversation when the topic clearly matches:

```toml
label = "Self-care companion"
when = "the user talks about their day, feelings, mood, or personal struggles"
instructions = """..."""
```

Every persona with a `when` is offered to the model as a switch target, so
mentioning your day can hand the conversation to the self-care companion, and
asking for a guessing game can hand it to the barkochba guesser — no command
needed. The switch is announced in the timeline as it happens. Personas without
a `when` are never auto-selected; pick those from the slash menu — note that
picking one there starts a fresh conversation, while an automatic switch keeps
the current one going. A persona that pins a `model` swaps the model too;
otherwise the current one is kept.

## Voice & dictation

Voice features (`models.text-to-speech` / `models.speech-to-text` in
`config.json`, plus the optional `stt` / `tts` groups for non-model settings)
need [speaches](https://speaches.ai) for STT/TTS and `ffmpeg` / `ffplay` for
mic and playback.

## Telegram

Chat with Kaja from Telegram instead of the terminal, reusing the same
personas, tools and models:

```bash
kaja telegram
```

Runs a long-polling bot until you stop it (Ctrl+C). Add a `[telegram]`
section to `services.toml` by hand:

```toml
[telegram]
botToken = "123456789:AAH..."
allowedUserIds = [YOUR_NUMERIC_ID]
```

Get `botToken` from [@BotFather](https://t.me/BotFather) ( `/newbot` ) and your
numeric id from [@userinfobot](https://t.me/userinfobot) — the allowlist takes
user ids, not `@usernames`, and messages from anyone else are ignored. Since
the bot can run tools, treat it as granting whoever is on that list the same
reach the terminal app has; shell commands come back as approve/decline
buttons. See the [setup guide](docs/telegram.md) for the full walkthrough.

## Develop

```bash
bun install
bun start
```

### Test / lint

```bash
bun test
bun lint # write immediately
```

<!-- ## Hotkeys

### Input field

| Key | Action |
|-----|--------|
| Enter | send message |
| Shift+Enter / Alt+Enter / Ctrl+Enter / Ctrl+J | insert newline |
| ↑ / ↓ | move cursor between lines (sticky column) |
| ← / → | move cursor by character |
| Ctrl+← / Ctrl+→ (or Alt+←/→) | jump by word |
| Home / End | start / end of current line |
| `/` on empty input | open menu |
| Ctrl+T | toggle mic dictation |

### Chat scrolling

| Key | Action |
|-----|--------|
| Mouse wheel | scroll chat |
| PageUp / PageDown | scroll by a page |
| Ctrl+↑ / Ctrl+↓ | scroll by a few lines |
| Ctrl+Home | jump to oldest message |
| Ctrl+End | jump to newest & follow |

### Menu

| Key | Action |
|-----|--------|
| ↑ / ↓ | move selection |
| Enter | select |
| Esc / Backspace | close menu |

### App

| Key | Action |
|-----|--------|
| Esc | quit (closes menu first if open) |
| Ctrl+C | quit |

## Prompt indicator

| Mark | Meaning |
|:----:|---------|
| >    | ready to type |
| *    | mic on, idle |
| o    | recording |
| ~    | transcribing |
| x    | muted while agent speaks | -->
