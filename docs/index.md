---
layout: home
title: Home
nav_order: 1
---

# Welcome to our Documentation 🦋

Kaja is a customisable, multi-purpose **AI agentic[^1] harness[^2]**.
Give it a task and it keeps looping with an LLM – calling tools, switching personas, remembering
what matters – until the job is done.

## What’s in the box

- **Front doors** ― Ways to talk to the same agent:
  - **[Terminal UI](/use/tui)** ― Console-based chat client.
  - **[Telegram](/use/telegram)** ― Minimal chat client on the go.
  - **[Widget](/use/widget)** ― Customised website clients.
- **[Web app](/use/web)** ― Your cloud account: abilities, keys, widgets and usage.
- **[Abilities](/abilities)** ― From the [marketplace](/abilities/marketplace):
  - **[Personas](/abilities/personas)** ― A named character with its own instructions, and optionally its own model.
  - **[Skills](/abilities/skills)** ― Instructions the agent loads when a request matches it.
  - **[Tools](/abilities/tools)** ― APIs the agent can call, like weather or search.
  - **[MCP servers](/abilities/mcp)** ― Ready-made tool sets, like a browser or library docs.
- **[Memory & datasets](/abilities/memory)** ― Long-term notes and structured questionnaires.
- **[Configuration](/config)** ― The TOML files behind local mode.

## Data safety

In **local mode**, conversation history and memory never leave your computer. Configs are plain
text files and everything else lives in a single SQLite file. Run your own models locally and no
internet connection is needed at all.

In **cloud mode**, sessions and memory are stored server-side against your account. See the
[Privacy Policy](/privacy) for what that means in practice.

---

Next:

[Installation](/start/install){: .btn .btn-green .fs-5 }

[^1]: Agent: the thing that acts

[^2]: Harness: the system that lets the agent act reliably
