---
layout: page
title: Configuration
nav_order: 5
has_children: true
---

# Configuration

Everything here is **[local mode](/modes#local-mode)**. Cloud mode keeps its settings in your account
and on disk has only a minimal `settings.toml` with your language and `mode = "cloud"`.

```ini
~/.config/kaja/
├─ settings.toml    # preferences, voice, marketplace, storage location
├─ models.toml      # providers and the model for each task
├─ secrets.toml     # every key and token, and nothing else
├─ abilities.toml   # which abilities load
├─ mcp.toml         # your own MCP servers
├─ marketplace/     # personas, skills, HTTP tools, MCP servers, datasets
└─ tools/*.ts       # your own plugin tools
```

The directory follows XDG (`$XDG_CONFIG_HOME/kaja` when set). The [setup wizard](/wizard) writes the
first version; after that they're yours to edit. Kaja reads them once at startup and never writes them
while running — restart to apply a change.

| File | Reference |
| --- | --- |
| `settings.toml` | [Settings](/configuration/config) |
| `models.toml` | [Models](/configuration/models) |
| `secrets.toml` | [Secrets](/configuration/secrets) |
| `abilities.toml` | [abilities.toml](/configuration/abilities) |
| `mcp.toml` | [MCP servers](/mcp#mcptoml) |
| `tools/*.ts` | [Your own tools](/tools#your-own-tools) |
| the SQLite file | [Local storage](/configuration/storage) |

`secrets.toml` is the only file that holds credentials, so the others are safe to share or paste into a
bug report.

## Commands

| Command | What it does |
| --- | --- |
| `kaja config paths` | print where every config file resolves on this machine — start here when unsure which file Kaja reads |
| `kaja config wizard` | re-run the [setup wizard](/wizard) |
| `kaja config diff` | show what `fetch` would change, without writing anything |
| `kaja config fetch` | rewrite `models.toml` from the defaults (backing it up if it differs), and write `secrets.toml` if you have none |
| `kaja doctor` | test every key, model and tool — see below |

`kaja config fetch` takes `models.toml` from the Kaja server's admin-managed catalog, or from the
templates bundled in the binary when you're offline or pass `--offline`. `secrets.toml` comes from
the bundled template, with every section commented out, and is only written when you don't have one
yet: once it holds a key it's left alone, so fetching never loses your keys. `--only models` or `--only secrets` limits it to one file. It never touches `settings.toml`,
`abilities.toml` or `mcp.toml`. Use it to pick up new defaults after an upgrade, or to recover a broken
file.

## Checking keys and models

`kaja doctor` tests every credential your config relies on: model providers, HTTP tools and MCP
servers, the Telegram token and web search. In a terminal it asks for anything missing or failing,
tests the new value before saving it to `secrets.toml`, and only keeps a failing value if you say so.

It then tries every model by task, and shows each chat model's context window and where the number
came from (`models.toml`, detected from the server, or assumed). When a task's model stops answering and
another model you configured for that task does, it offers to switch: only that task's line in `[tasks]`
changes, so every model entry and any persona pin stay as they are. It ends with what's still left to fix,
and lists every tool by origin plus anything left out and why.

## Editor support

JSON Schemas for every file ship in
[`docs/config/schemas`](https://github.com/SubZtep/kaja/tree/main/docs/config/schemas), and
[`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config) has example files. With the
recommended VS Code TOML extension you get completion and validation while editing.

---

Next:

[Settings](/configuration/config){: .btn .btn-green .fs-5 }
