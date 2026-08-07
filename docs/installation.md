---
layout: page
title: Installation
nav_order: 2
---

# Installation

Run the setup script that find and install the correct version.

On Max or Linux:

```sh
curl -fsSL https://kaja.io/setup.sh | bash
```

On Windows:

```powershell
irm https://kaja.io/setup.ps1 | iex
```

Or grab directly from [GitHub Releases](https://github.com/SubZtep/kaja/releases)
— x64 and arm64.

## First run

Run `kaja`. If no config exists yet, a one-time setup wizard asks how you want to chat:

- **Free hosted chat** — nothing else to configure, works immediately.
- **Bring your own provider** — writes a starter `models.toml` for either Fireworks AI or a
  local Ollama install, which you then fill in with your own credentials/models (see
  [Configuration](/configuration#models)).

> Running in a non-interactive shell (scripts, CI) skips the wizard and writes the default
template untouched.

<!-- ## Basic usage

```sh
# Start a new chat
kaja

# Resume the most recent session
kaja -c
kaja --continue

# Resume a specific session by id
kaja -s 42
kaja --session 42
```

Other subcommands:

```sh
kaja session list         # list saved sessions
kaja session diagram 42   # render a session as a Mermaid diagram

kaja memory list          # list remembered notes
kaja memory forget <key>  # forget a note (supports * wildcards)
kaja memory export        # dump memory as JSON

kaja telegram             # run as a Telegram bot
kaja config fetch         # pull mcp.toml/models.toml from a Kaja server
kaja config wipe          # back up and clear ~/.config/kaja
``` -->

---

Next:

[Configuration](/configuration){: .btn .btn-green .fs-5 }
