---
layout: page
title: abilities.toml
parent: Configuration
nav_order: 5
summary: "abilities.toml: which abilities load."
---

# abilities.toml

Which [abilities](/abilities) load in local mode. Synced files in `~/.config/kaja/marketplace/` load only
when listed here. `kaja abilities` writes it as a checklist, and you can edit it by hand.

```toml
# Skills, by folder name: marketplace/abilities/<name>/SKILL.md
skills = ["system-report", "meeting-notes"]

# HTTP tools, by folder name: marketplace/abilities/<name>/tool.toml
tools = ["open-meteo"]

# MCP servers, by folder name: marketplace/abilities/<name>/mcp.toml
mcp = ["context7"]

# Personas, by file name: marketplace/personas/<id>.toml
personas = ["care", "barkochba"]
```

- `default` is always loaded and needn't be listed.
- Skills and personas you added yourself (ones the sync didn't write) always load and needn't be listed. To
  switch one off, rename or move its file. Your own tools and MCP servers still need listing.
- Datasets aren't listed. Every one in the folder is available to the personas that name it.
- A listed ability that's missing or broken is skipped with a warning, and the rest still load.
- The [local Telegram bot](/using/telegram#local-bot) reads this once at start, so restart it after a change.

## `[source]`

Where `kaja abilities update` fetches the marketplace from, by default the Kaja repo's `main` branch. Point
it at a fork, another branch or a local checkout to test your own changes:

```toml
[source]
url = "/home/me/src/kaja"   # any git URL or local path
ref = "my-branch"
```

Changing `url` makes the next update clone afresh.

---

Next:

[Local storage](/configuration/storage){: .btn .btn-green .fs-5 }
