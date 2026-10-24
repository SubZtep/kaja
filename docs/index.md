---
layout: home
title: Home
nav_order: 1
---

# Welcome to our Documentation 🦋

Kaja is a customisable, multi-purpose **AI agentic[^1] harness[^2]**.
Give it a task and it keeps looping with an LLM – calling tools, switching personas, remembering
what matters – until the job is done.

## Interfaces

- **[Terminal UI](/use/tui)** ― Console-based chat client.
- **[Telegram](/use/telegram)** ― Chat client via a bot.
- **[Widget](/use/widget)** ― A cloud principal with its own token and published source.
- **[Web app](/use/web)** ― Your cloud account: Telegram link, widgets, sandboxes and usage.

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
