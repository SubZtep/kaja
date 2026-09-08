---
layout: page
title: Installation
nav_order: 2
---

# Installation

Run the setup script that finds and installs the correct version.

On macOS or Linux:

```sh
curl -fsSL https://kaja.io/install.sh | bash
```

On Windows:

```powershell
irm https://kaja.io/install.ps1 | iex
```

Or grab a binary directly from [GitHub Releases](https://github.com/SubZtep/kaja/releases)
— x64 and arm64.

## First run

Run `kaja`. With no config on disk, it starts in [hosted mode](/modes) and walks you through a
**device login**: approve the printed code in your browser and you're chatting. Nothing to
configure, no LLM key of your own.

Want the agent to run on your own machine against your own provider instead?

```sh
kaja --local
```

The first `--local` run asks which provider template to start from (Fireworks AI or a local
Ollama) and writes `~/.config/kaja/`. Fill in your credentials in
[`secrets.toml`](/configuration/secrets), then run `kaja` again — from then on the auto-detect
picks local, because a config now exists.

> In a non-interactive shell (scripts, CI) the setup prompt is skipped and the default template is
> written untouched.
{: .note }

## Command surface

```sh
kaja                      # chat — hosted or local, auto-detected
kaja --local              # force the local agent loop
kaja --remote             # force hosted login
kaja --help               # flags and subcommands
kaja logout               # clear the stored hosted token

# Local mode only
kaja -c                   # resume the most recent session
kaja --continue
kaja -s <id>              # resume a specific session
kaja --session <id>
kaja telegram             # run as a Telegram bot
kaja --headless telegram  # same, without rendering the terminal UI

# Config files (local mode)
kaja config fetch         # rewrite mcp.toml / models.toml / personas from the bundled templates
kaja config paths         # print where every config file lives
kaja config wipe          # back up and clear ~/.config/kaja
```

## Uninstall

```sh
rm ~/.local/bin/kaja
```

Local config and data are left behind — remove them with `kaja config wipe` first (which backs
them up) or delete `~/.config/kaja` and the SQLite file yourself.

---

Next:

[Modes](/modes){: .btn .btn-green .fs-5 }
