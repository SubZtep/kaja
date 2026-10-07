---
layout: page
title: Commands & doctor
parent: Configuration
nav_order: 6
summary: "Find, refresh and test your config with kaja config and kaja doctor."
---

# Commands & doctor

## Commands

| Command | What it does |
| --- | --- |
| `kaja config paths` | print where every config file resolves on this machine. Start here when unsure which file Kaja reads |
| `kaja config wizard` | re-run the [setup wizard](/getting-started/wizard) |
| `kaja config diff` | show what `fetch` would change, without writing anything |
| `kaja config fetch` | rewrite `models.toml` and `commands.toml` from the defaults (backing them up if they differ), and write `secrets.toml` if you have none |
| `kaja doctor` | test every key, model and tool, see below |

`kaja config fetch` takes `models.toml` and `commands.toml` from the Kaja server's defaults, or from the templates
bundled in the binary when you're offline or pass `--offline`. Your own patterns in `commands.toml`'s `custom` survive a fetch. `secrets.toml` comes from the bundled
template with every section commented out, and is only written if you have none, so fetching never loses a
key. `--only models`, `--only commands` or `--only secrets` limits it to one file. It never touches `settings.toml`
or the `marketplace/` folder. Use it to pick up new defaults after an upgrade, or to recover a broken file.

## Checking keys and models

`kaja doctor` tests every credential your config relies on: model providers, HTTP tools and MCP servers, the
Telegram token and web search. In a terminal it asks for anything missing or failing, tests the new value
before saving it to `secrets.toml`, and keeps a failing value only if you say so.

It then tries every model by task, and shows each chat model's context window and where the number came from
(`models.toml`, detected from the server, or assumed). When a task's model stops answering and a model further
down that lists the task works, it offers to switch: the broken models ahead of it are commented out of
`models.toml`, so the working one comes first. It ends with what's still broken, and lists every tool by origin
plus anything left out and why.

---

Next:

[Troubleshooting](/troubleshooting){: .btn .btn-green .fs-5 }
