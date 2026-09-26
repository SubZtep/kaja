---
layout: page
title: abilities.toml
parent: Configuration
nav_order: 4
---

# abilities.toml

Which [abilities](/abilities) load in local mode. Files in `~/.config/kaja/marketplace/` — synced or
your own — load only when they're listed here. `kaja abilities` writes it as a checklist, and you can
edit it by hand.

```toml
# Skills, by folder name: marketplace/skills/<name>/SKILL.md
skills = ["system-report", "meeting-notes"]

# HTTP tools, by file name: marketplace/tools/<name>.toml
tools = ["open-meteo"]

# MCP servers, by file name: marketplace/mcp/<name>.toml
mcp = ["context7"]

# Personas, by file name: marketplace/personas/<id>.toml
personas = ["care", "barkochba"]
```

- `default` is always loaded and needn't be listed.
- Datasets aren't listed: every one in the folder is available to the personas that name it.
- A listed ability that's missing or broken is skipped with a warning; the rest still load.
- The [local Telegram bot](/using/telegram#local-bot) reads this once at start, so restart it after a change.

## `[source]`

Where `kaja abilities update` fetches the marketplace from: the Kaja repo's `main` branch by default.
Point it at a fork, another branch, or a local checkout to test your own changes:

```toml
[source]
url = "/home/me/src/kaja"   # any git URL or local path
ref = "my-branch"
```

Changing `url` makes the next update clone afresh.

---

Next:

[Local storage](/configuration/storage){: .btn .btn-green .fs-5 }
