---
layout: home
title: Home
nav_order: 1
---

# Kaja Documentation 🦋

**Kaja is a highly customisable, multi-purpose AI agent you talk to from your terminal.**
Give it a task and it keeps looping with an LLM — calling tools, switching personas, remembering
what matters — until the job is done.

There are two ways to run it, and you pick per-invocation:

| | **Hosted** (default) | **Local** (`--local`) |
|---|---|---|
| Agent loop runs | on `api.kaja.io` | on your machine |
| Needs an account | yes (device login) | no |
| Needs your own LLM key | no | yes |
| Config files | none | `~/.config/kaja/` |
| Sessions & memory stored | Postgres, server-side | SQLite, in your home dir |
| Shell, files, MCP, plugins | ✗ | ✓ |

See [Modes](/modes) for the full comparison and how the auto-detect picks one.

## What's in the box

- **[Terminal UI](/tui)** — the chat client, keyboard-driven.
- **[Personas](/personas)** — named characters with their own instructions, model, and sampling.
- **[Tools](/tools)** — built-ins, MCP servers, and your own TypeScript plugins.
- **[Memory & datasets](/memory)** — long-term notes and structured questionnaires.
- **[Telegram](/telegram)** — the same agent as a bot.
- **[Widget](/widget)** — an embeddable chat bubble for your own website.
- **[Configuration](/configuration)** — the TOML files behind local mode.

## Data safety

In **local mode**, conversation history and memory never leave your computer — configs are plain
text files and everything else lives in a single SQLite file. Run your own models locally and no
internet connection is needed at all.

In **hosted mode**, sessions and memory are stored server-side against your account. See the
[Privacy Policy](/privacy) for what that means in practice.

---

Next:

[Installation](/installation){: .btn .btn-green .fs-5 }
