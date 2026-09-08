---
layout: page
title: Configuration
nav_order: 4
---

# Configuration

Everything on this page is **[local mode](/modes) only** — hosted mode reads no config files at
all, apart from a minimal `settings.toml` holding your UI language.

LLM provider credentials, model-to-task mapping, secrets, services, and preferences live in
`~/.config/kaja/`, alongside [`personas`](https://github.com/SubZtep/kaja/tree/main/docs/config/personas)
and their [`datasets`](https://github.com/SubZtep/kaja/tree/main/docs/config/datasets).

```ini
~/.config/kaja/
├─ datasets/*.json  # structured field sets for personas to collect
├─ personas/*.toml  # one behaviour per file
├─ tools/*.ts       # your own plugin tools
├─ mcp.toml         # model context protocol servers
├─ models.toml      # model catalog per provider
├─ services.toml    # external service definitions and endpoints
├─ secrets.toml     # your secret keys and tokens
└─ settings.toml    # preferences and app settings
```

Run `kaja config paths` to print the resolved location of each of these on your machine — the
directory follows XDG, so `$XDG_CONFIG_HOME/kaja` when set.

The first `kaja --local` run seeds these from the templates in
[`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config). `kaja config fetch`
later downloads the current admin-managed defaults (personas, model catalog, MCP servers) from
the hosted API's `GET /config/export` and rewrites `models.toml`/`mcp.toml`/`personas/*.toml`
from that, backing up anything you'd changed; with no network (or `--offline`), it falls back to
the same bundled templates as first run. `kaja config diff` shows what a fetch would change
without writing anything, and `kaja config wizard` re-runs the interactive first-run setup at any
time (language, provider, persona). `secrets.toml`, `services.toml`, and `settings.toml` are
never touched by `fetch` — those stay yours to hand-edit.

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
    P["personas/*.toml"]
    D["datasets/*.json"]
    K["secrets.toml<br><small>every key and token</small>"]

    K -.->|"[providers.x]"| M
    K -.->|"[api] [location] [webSearch] [telegram]"| V
    K -.->|"[mcp.id]"| C
    P -->|"dataset id"| D
    P -.->|"model pin"| M
    S -->|"default persona"| P
```

`secrets.toml` is the only file that holds credentials — the others stay safe to share, commit, or
paste into a bug report.

## Editor support

JSON Schemas for every one of these files ship in
[`docs/config/schemas`](https://github.com/SubZtep/kaja/tree/main/docs/config/schemas). Install the
recommended VSCode TOML extension and you get completion and validation while editing.

---

Next:

[Settings](/configuration/config){: .btn .btn-green .fs-5 }
