---
layout: page
title: Config folder
parent: Configuration
nav_order: 1
summary: "The files in ~/.config/kaja and which page covers each."
---

# Config folder

Everything here is **[local mode](/getting-started/modes#local-mode)**. Cloud mode keeps its settings in your
account, and on disk has only a minimal `settings.toml` with your language and `mode = "cloud"`.

```ini
~/.config/kaja/
├─ settings.toml    # preferences, voice, marketplace, storage location
├─ models.toml      # providers and the model for each task
├─ secrets.toml     # every key and token, and nothing else
├─ abilities.toml   # which abilities load
├─ mcp.toml         # your own MCP servers
└─ marketplace/     # abilities (skills, HTTP tools, MCP servers, code tools), personas, datasets
```

The folder follows XDG (`$XDG_CONFIG_HOME/kaja` when set). The [setup wizard](/getting-started/wizard)
writes the first version, and after that the files are yours to edit. Kaja reads them once at startup and
never writes them while running, so restart to apply a change.

| File | Reference |
| --- | --- |
| `settings.toml` | [Settings](/configuration/config) |
| `models.toml` | [Models](/configuration/models) |
| `secrets.toml` | [Secrets](/configuration/secrets) |
| `abilities.toml` | [abilities.toml](/configuration/abilities) |
| `mcp.toml` | [MCP servers](/abilities/mcp#mcptoml) |
| the SQLite file | [Local storage](/configuration/storage) |

Only `secrets.toml` holds credentials, so the other files are safe to share or paste into a bug report.

## Editor support

JSON Schemas for every file ship in
[`docs/config/schemas`](https://github.com/SubZtep/kaja/tree/main/docs/config/schemas), and
[`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config) has example files. With the
recommended VS Code TOML extension you get completion and validation as you edit.

---

Next:

[Settings](/configuration/config){: .btn .btn-green .fs-5 }
