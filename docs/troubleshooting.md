---
layout: page
title: Troubleshooting
nav_order: 6
---

# Troubleshooting

Start with **`kaja doctor`** (local mode): it tests every key, model, MCP server and tool, asks for
what's missing, and ends with what's still left to fix. `kaja config paths` shows which files Kaja is
actually reading.

## Common problems

**The model doesn't answer.** Run `kaja doctor`. It tries every model and, when the one a task uses
fails but another configured model for that task works, offers to switch. For a local server, check it's
running at the `base_url` in [`models.toml`](/configuration/models).

**"No chat model" on start in local mode.** Local mode needs a `chat` model in `[tasks]` and never falls
back to cloud. Add one, run `kaja config wizard`, or start with `kaja --cloud`.

**Cloud mode won't sign in: keychain unavailable.** The cloud token is kept only in the OS credential
store; there is no plaintext fallback. Use `kaja --local`, or unlock or install a keychain (on Linux, a
Secret Service provider such as GNOME Keyring or KWallet).

**`kaja abilities update` fails.** It needs `git` 2.25 or newer; `kaja doctor` shows the version it
found. A private or mistyped [`[source]`](/configuration/abilities#source) URL fails rather than asking
for a password. Check `[marketplace] enabled` isn't `false`.

**An ability doesn't show up.** It loads only when it's listed in
[`abilities.toml`](/configuration/abilities) (run `kaja abilities`), and one that needs a key is left out
until the key is in `secrets.toml`. `kaja doctor` lists everything left out and why.

**An MCP server's tools are missing.** A server that fails to connect, or takes over 10 seconds, is
skipped so the session can start. Check its command or URL, and its secrets.

**Alt shortcuts type strange characters (macOS).** Set `hotkeyModifier = "ctrl"` in
[`settings.toml`](/configuration/config#preferences), or turn on "Option as Meta" in your terminal.

**A setting change did nothing.** Config is read once at startup: restart Kaja. The local Telegram bot
needs a restart too.

## Logs

The terminal UI never logs to the screen. To get a log file, set both environment variables:

```sh
KAJA_LOG_LEVEL=debug KAJA_LOG_FILE=~/kaja.log kaja
```

Levels are `trace`, `debug`, `info`, `warn`, `error` and `fatal`. The file is JSON lines, and includes
the agent's warnings: skipped abilities, missing keys, failed MCP connections.

## Still stuck?

Open an issue on [GitHub](https://github.com/SubZtep/kaja/issues) with the `kaja doctor` output. Your
config files other than `secrets.toml` are safe to include.

---

Next:

[Development](/development){: .btn .btn-green .fs-5 }
