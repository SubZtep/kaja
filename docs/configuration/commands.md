---
layout: page
title: Doctor & troubleshooting
parent: Configuration
nav_order: 6
summary: "Find, refresh and test your config, and what to do when something's wrong."
icon: 🩺
---

# Doctor & troubleshooting

## Commands

| Command | What it does |
| --- | --- |
| `kaja config paths` | print where every config file resolves on this machine. Start here when unsure which file Kaja reads |
| `kaja config wizard` | re-run the [setup wizard](/getting-started/wizard) |
| `kaja config diff` | show what `fetch` would change, without writing anything |
| `kaja config fetch` | rewrite `models.toml` and `commands.toml` from the defaults (backing them up if they differ), and write `secrets.toml` if you have none |
| `kaja doctor` | test every key, model and tool, see below |

`kaja config fetch` takes `models.toml` and `commands.toml` from the Kaja server's defaults, or from the
templates bundled in the binary when you're offline or pass `--offline`. Your own patterns in
`commands.toml`'s `custom` survive a fetch. `secrets.toml` comes from the bundled template with every section
commented out, and is only written if you have none, so fetching never loses a key. `--only models`,
`--only commands` or `--only secrets` limits it to one file. It never touches `settings.toml` or the
`marketplace/` folder. Use it to pick up new defaults after an upgrade, or to recover a broken file.

## Checking keys and models

`kaja doctor` (local mode) tests every credential your config relies on: model providers, HTTP tools and MCP
servers, the Telegram token and web search. In a terminal it asks for anything missing or failing, tests the
new value, and saves it to `secrets.toml`. A value that fails is saved too, so you can fix it there, and
stays on the to-do list until it works. Then, like the [setup wizard](/getting-started/wizard#after-the-last-question),
it offers to install what an ability a persona uses is missing (uv, Chrome), or to run that ability on a
[Kaja sandbox](/abilities/mcp#on-a-sandbox-from-local-mode).

It then tries every model by task, and shows each chat model's context window and where the number came from
(`models.toml`, detected from the server, or assumed). When a task's model stops answering and a model
further down that lists the task works, it offers to switch: the broken models ahead of it are commented out
of `models.toml`, so the working one comes first. It ends with what's still broken, and lists every tool by
origin plus anything left out and why.

## When something's wrong

Run `kaja doctor` first. For the rest:

- **A local model doesn't answer:** check its server runs at the `base_url` in
  [`models.toml`](/configuration/models). Local mode needs a model that lists `chat`, and never falls back to
  the cloud.
- **Cloud mode won't sign in:** the token is only kept in the OS keychain
  ([Cloud mode](/getting-started/modes#cloud-mode)). On Linux, install or unlock a Secret Service provider
  such as GNOME Keyring or KWallet, or use `--local`.
- **`kaja abilities update` fails:** it needs `git` 2.25 or newer (`kaja doctor` shows yours), and a private
  or mistyped [`[marketplace]`](/configuration/config#marketplace) `url` fails rather than asking for a
  password. `enabled = false` there turns it off.
- **An ability or MCP server is missing:** a chat only gets what its persona lists
  ([Personas](/abilities/personas#abilities)), an ability without its key stays out, and an MCP server that
  doesn't connect within 10 seconds is skipped. `kaja doctor` says which and why.
- **Alt shortcuts type odd characters (macOS):** set `hotkeyModifier = "ctrl"`
  ([Key bar](/using/tui#key-bar)).
- **A setting change did nothing:** config is read once at startup, so restart Kaja (and `kaja telegram`).

## Logs

The terminal UI never logs to the screen. For a log file, set both variables:

```sh
KAJA_LOG_LEVEL=debug KAJA_LOG_FILE=~/kaja.log kaja
```

Levels are `trace`, `debug`, `info`, `warn`, `error` and `fatal`. The file is JSON lines and includes the
agent's warnings: skipped abilities, missing keys, failed MCP connections.

## Still stuck?

Open an issue on [GitHub](https://github.com/SubZtep/kaja/issues) with the `kaja doctor` output. Every
config file except `secrets.toml` is safe to include.

---

Next:

[Development](/development){: .btn .btn-green .fs-5 }
