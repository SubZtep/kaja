---
layout: page
title: Configuration
nav_order: 4
---

# Configuration

Everything on this page is **[local mode](/modes) only** — cloud mode reads no config files at
all, apart from a minimal `settings.toml` holding your UI language.

LLM provider credentials, model-to-task mapping, secrets, services, and preferences live in
`~/.config/kaja/`, alongside the marketplace's [personas](/personas) and their
[datasets](/memory#datasets).

```ini
~/.config/kaja/
├─ marketplace/     # skills, personas, datasets, HTTP tools and MCP servers, synced and your own
├─ tools/*.ts       # your own plugin tools
├─ mcp.toml         # model context protocol servers
├─ models.toml      # model catalog per provider
├─ abilities.toml    # which of them are loaded
├─ services.toml    # external service definitions and endpoints
├─ secrets.toml     # your secret keys and tokens
└─ settings.toml    # preferences and app settings
```

Run `kaja config paths` to print the resolved location of each of these on your machine — the
directory follows XDG, so `$XDG_CONFIG_HOME/kaja` when set.

The first `kaja --local` run seeds these from the templates in
[`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config). `kaja config fetch`
later downloads the current admin-managed model catalog from
the cloud API's `GET /config/export` and rewrites `models.toml`
from that, backing up anything you'd changed; with no network (or `--offline`), it falls back to
the same bundled templates as first run. It also resets `secrets.toml` to the commented-out template,
keeping your old one as a `.bak`. `kaja config diff` shows what a fetch would change
without writing anything, and `kaja config wizard` re-runs the setup wizard at any time (language,
mode, provider, server address), each step opening on what you already have; it
finishes by asking for and testing any keys your config needs, the same pass `kaja doctor` runs.
The wizard doesn't ask about abilities: a machine with none yet gets the recommended set — everything
needing no key, minus MCP servers that run a command locally — turned on for it, and one that already
has some is left exactly as it is. `kaja abilities` is where you choose among the rest. A final step
offers web search, voice and a Telegram bot, all unticked, so pressing Enter skips them. If your
model server is Ollama and hasn't got the models your `models.toml` names, the wizard offers to
download them — one question for all of them, not one per model — before it tests anything. `mcp.toml`, `services.toml`, `settings.toml` and `abilities.toml` are never touched
by `fetch` — those stay yours to hand-edit. Personas, like the rest of the marketplace, come from
`kaja abilities update` instead.

## Which file does what

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart LR
    S["settings.toml<br><small>preferences, stt, tts, memory</small>"]
    M["models.toml<br><small>providers + model per task</small>"]
    V["services.toml<br><small>URLs, ids, flags</small>"]
    C["mcp.toml<br><small>MCP servers</small>"]
    P["marketplace/personas/*.toml"]
    G["abilities.toml<br><small>what loads</small>"]
    D["marketplace/datasets/*.json"]
    K["secrets.toml<br><small>every key and token</small>"]

    K -.->|"[providers.x]"| M
    K -.->|"[api] [location] [webSearch] [telegram]"| V
    K -.->|"[mcp.id]"| C
    P -->|"dataset id"| D
    P -.->|"model pin"| M
    G -->|"personas = [...]"| P
```

`secrets.toml` is the only file that holds credentials — the others stay safe to share, commit, or
paste into a bug report.

## Checking keys and tokens

`kaja doctor` tests every credential your config relies on: model providers, HTTP tool and MCP
abilities, MCP servers that list `secrets`, and the location, Telegram and web search services. In a terminal it
asks for anything missing or not working, tests the new value before saving it to `secrets.toml`,
and only keeps a value that fails its test if you say so. A provider without a key is fine as long
as its model answers (Ollama needs none). It ends with what's still left to fix and where.

## Editor support

JSON Schemas for every one of these files ship in
[`docs/config/schemas`](https://github.com/SubZtep/kaja/tree/main/docs/config/schemas). Install the
recommended VSCode TOML extension and you get completion and validation while editing.

---

Next:

[Settings](/configuration/config){: .btn .btn-green .fs-5 }
