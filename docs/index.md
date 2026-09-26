---
layout: home
title: Home
nav_order: 1
---

# Welcome to our Documentation 🦋

**Kaja is a highly customisable, multi-purpose AI agent you talk to from your terminal.**
Give it a task and it keeps looping with an LLM — calling tools, switching personas, remembering
what matters — until the job is done.

There are two ways to run it:

| | **Cloud** | **Local** |
|---|---|---|
| Agent loop runs | on `api.kaja.io` | on your machine |
| Needs an account | yes (device login) | no |
| Needs your own LLM | no | yes |
| Sessions & memory stored | Postgres, server-side | SQLite, in your home dir |
| Shell, files, your own MCP servers and plugins | ✗ | ✓ |

[Cloud or local](/getting-started/modes) has the full comparison and how a launch picks one.

## What's in the box

- **[Terminal UI](/using/tui)** — the keyboard-driven chat client.
- **[Telegram](/using/telegram)** and a **[website widget](/using/widget)** — the same agent, elsewhere.
- **[Web app](/using/web-app)** — your kaja.io account: abilities, keys, widgets, Telegram link, usage.
- **[Abilities](/abilities)** — [personas](/abilities/personas), [skills](/abilities/skills), [HTTP tools](/abilities/http-tools) and
  [MCP servers](/abilities/mcp) from the marketplace, plus the [built-in tools](/abilities/tools).
- **[Memory & datasets](/abilities/memory)** — long-term notes and structured questionnaires.
- **[Configuration](/configuration)** — the TOML files behind local mode.

## Data safety

In **local mode**, conversation history and memory never leave your computer — configs are plain
text files and everything else lives in a single SQLite file. Run your own models locally and no
internet connection is needed at all.

In **cloud mode**, sessions and memory are stored server-side against your account. See the
[Privacy Policy](/privacy) for what that means in practice.

## Glossary

| Term | Meaning |
| --- | --- |
| **ability** | anything the marketplace adds: a persona, skill, HTTP tool, MCP server or dataset |
| **persona** | a named character with its own instructions, and optionally its own model |
| **skill** | a folder of instructions the agent loads when a request matches it |
| **dataset** | a questionnaire a persona fills in over time |
| **front door** | a way in to the agent: terminal, Telegram or widget |
| **Nasi** | Kaja's brain: the agent every front door runs ([more](/abilities/nasi)) |

---

Next:

[Installation](/getting-started/installation){: .btn .btn-green .fs-5 }
