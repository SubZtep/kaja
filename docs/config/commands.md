---
layout: page
title: Doctor & troubleshooting
parent: Configuration
nav_order: 6
summary: Find, refresh and test your config, and what to do when something's wrong.
icon: 🩺
---

# Doctor & troubleshooting

## Commands

| Command              | What it does                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kaja config paths`  | print where every config file resolves on this machine. Start here when unsure which file Kaja reads                                                                   |
| `kaja config wizard` | re-run the [setup wizard](/start/wizard)                                                                                                                               |
| `kaja config diff`   | show whether `fetch` would change `models.toml`, without writing anything                                                                                              |
| `kaja config fetch`  | refresh `models.toml` from [models.dev](https://models.dev) (backing it up if it differs)                                                                              |
| `kaja config hooks`  | find a sound player, notifier and speech tool on this machine and write [`hooks.toml`](/config/settings#hookstoml-commands-that-run-on-chat-events) from what it finds |
| `kaja doctor`        | test every key, model and tool, see below                                                                                                                              |

`kaja config fetch` updates what [models.dev](https://models.dev) says about the providers and models in
`models.toml` (see [models.toml](/config/models#writing-it)), keeping every model you picked and backing the old
file up first. Offline it leaves `models.toml` alone. It touches no other file. To switch to a newer model, run
`kaja config wizard`.

## Checking keys and models

`kaja doctor` (local mode) tests every credential your config relies on: model providers, HTTP tools and MCP
servers, the Telegram token and web search. In a terminal it asks for anything missing or failing, tests the
new value, and saves it to `secrets.toml`. A value that fails is saved too, so you can fix it there, and
stays on the to-do list until it works. Then, like the [setup wizard](/start/wizard#after-the-last-question),
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
  [`models.toml`](/config/models). Local mode needs a model that lists `chat`, and never falls back to
  the cloud.
- **Cloud mode won't sign in:** the token is only kept in the OS keychain
  ([Cloud mode](/start/modes#cloud-mode)). On Linux, install or unlock a Secret Service provider
  such as GNOME Keyring or KWallet, or use `--local`.
- **`kaja abilities update` fails:** it needs `git` 2.25 or newer (`kaja doctor` shows yours), and a private
  or mistyped [`[marketplace]`](/config/settings#marketplace) `url` fails rather than asking for a
  password. `enabled = false` there turns it off.
- **An ability or MCP server is missing:** a chat only gets what its persona lists
  ([Personas](/abilities/personas#abilities)), an ability without its key stays out, and an MCP server that
  doesn't connect within 10 seconds is skipped. `kaja doctor` says which and why.
- **Alt shortcuts type odd characters (macOS):** set `hotkeyModifier = "ctrl"`
  ([Key line](/use/tui#key-line)).
- **A setting change did nothing:** config is read once at startup, so restart Kaja (and `kaja telegram`).

## Logs

The terminal UI never logs to the screen. Warnings and errors go to a log file, `kaja.log` in your state
folder (`~/.local/state/kaja/` on Linux, `~/Library/Logs/kaja/` on macOS); `kaja config paths` shows where.
It starts over past 1 MB, keeping the previous one as `kaja.log.1`. For more detail, or another file:

```sh
KAJA_LOG_LEVEL=debug KAJA_LOG_FILE=~/kaja.log kaja
```

Levels are `trace`, `debug`, `info`, `warn`, `error` and `fatal`; `KAJA_LOG_LEVEL=off` turns the log off.
The file is JSON lines and includes the agent's warnings: skipped abilities, missing keys, failed MCP
connections. It never holds your messages or keys, so it's safe to attach to an issue.

## Still stuck?

Open an issue on [GitHub](https://github.com/SubZtep/kaja/issues) with the `kaja doctor` output. Every
config file except `secrets.toml` is safe to include.
