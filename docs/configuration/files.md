---
layout: page
title: Config folder
parent: Configuration
nav_order: 1
summary: The files in ~/.config/kaja and which page covers each.
icon: 📁
---

# Config folder

Everything here is **[local mode](/getting-started/modes#local-mode)**. Cloud mode keeps its settings in your
account, and on disk has only a minimal `settings.toml` with your language and `mode = "cloud"`.

```ini
~/.config/kaja/
├─ settings.toml    # preferences, voice, marketplace, storage location
├─ models.toml      # providers and the model for each task
├─ secrets.toml     # every key and token, and nothing else
├─ hooks.toml       # optional: commands to run on chat events
└─ marketplace/     # abilities (skills, HTTP tools, MCP servers, code tools), personas, datasets
```

The folder follows XDG (`$XDG_CONFIG_HOME/kaja` when set). `KAJA_PROFILE` is appended to its name, and to
the data folder's: `KAJA_PROFILE=dev kaja` uses `~/.config/kaja-dev/`, a separate setup of its own. The
[setup wizard](/getting-started/wizard) writes the first version, and after that the files are yours to
edit. Kaja reads them once at startup and never writes them while running, so restart to apply a change.

| File            | Reference                                                                  |
| --------------- | -------------------------------------------------------------------------- |
| `settings.toml` | [Settings](/configuration/config)                                          |
| `models.toml`   | [Models](/configuration/models)                                            |
| `secrets.toml`  | [Secrets](/configuration/secrets)                                          |
| `hooks.toml`    | [Hooks](/configuration/config#hookstoml-commands-that-run-on-chat-events)  |
| `marketplace/`  | [The marketplace](/abilities/marketplace), [Personas](/abilities/personas) |
| the SQLite file | [Local storage](/configuration/storage)                                    |

Only `secrets.toml` holds credentials, so the other files are safe to share or paste into a bug report.

## Editor support

JSON Schemas for every file are served at `https://api.kaja.io/config/schemas/<file>.json` (`settings`,
`models`, `secrets`, `commands` and `hooks`), and the [model examples](/configuration/models#examples) are
served by the Kaja API too. To pick one for a file, start it with a
[Tombi](https://tombi-toml.github.io/tombi/) schema directive and a blank line after it:

```toml
#:schema https://api.kaja.io/config/schemas/models.json
```

With the recommended VS Code TOML extension you get completion and validation as you edit.

---

Next:

[Settings](/configuration/config){: .btn .btn-green .fs-5 }
