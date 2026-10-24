---
layout: page
title: Nasi
parent: Abilities
nav_order: 1
summary: The agent at the heart of Kaja and how it loops.
icon: 🌀
---

# ₙ𝐀ₛ𝐈 🧠

### `[̲̅N][̲̅a][̲̅s][̲̅i] [̲̅i][̲̅s] [̲̅t][̲̅h][̲̅e]`<br>`[̲̅m][̲̅o][̲̅s][̲̅t] [̲̅i][̲̅m][̲̅p][̲̅o][̲̅r][̲̅t][̲̅a][̲̅n][̲̅t]`<br>`[̲̅p][̲̅a][̲̅r][̲̅t] [̲̅o][̲̅f] [̲̅K][̲̅a][̲̅j][̲̅a]🤖[̲̅.]`

---

> Think of Nasi as Kaja’s business logic rather than a service. There’s no Nasi server to connect to: it’s a library that whatever hosts it carries along and runs in-process. The terminal app embeds it, the web API embeds it, and so can any future piece of Kaja. Each host gets the same code and the same behaviour, and only supplies the surroundings: a model, a place to store things and a set of tools.
> {: .headsup }

Everything else in this section plugs into Nasi: [personas](/abilities/personas) give it a voice,
[skills](/abilities/skills) teach it procedures, [tools](/abilities/tools) (built-in and HTTP)
and [MCP servers](/abilities/mcp) give it hands, and [memory & datasets](/abilities/memory) let it remember
you.

## Where it runs

On your machine in local mode (and `kaja telegram`), and on the Kaja API for cloud mode and the cloud Telegram
bot. It's the same brain either way; the cloud one gets a smaller toolset because it serves
many people. [Cloud or local](/start/modes) has the full comparison.

## What it knows when a conversation starts

Nasi begins a conversation by writing itself a brief, the system prompt, from whatever applies:

1. the active [persona](/abilities/personas)’s instructions (`default` when none is picked);
2. where it runs: your OS in the terminal, or the channel (Telegram);
3. how to use the tools that need care: asking you questions, running shell commands, keeping notes;
4. the other personas it may switch to, and when;
5. the names and descriptions of the persona's [skills](/abilities/skills), and the full text of its sticky ones;
6. a [dataset](/abilities/memory#datasets) to collect, if the persona has one, and what you've already
   answered in your profile;
7. your sticky [memory notes](/abilities/memory#notes);
8. the language to reply in ([Voice & language](/use/voice#language)).

Anything that isn't set up is left out, so a cloud conversation sees a subset of what a local one
does. A change to a persona's abilities applies from your next message, even mid-conversation.

## How a turn works

Nasi calls the model, runs the tools it asks for, feeds the results back, and repeats until the model has an
answer. Along the way it can stop and hand control back to you:

- **a question** (`ask_user`): your next message is the answer;
- **an approval**: a shell command, or an HTTP tool or MCP call that changes something, waits for your OK.
  Simple read-only shell commands on your
  [safe list](/config/settings#commandstoml-commands-that-run-without-asking) (listing files,
  `git status`) run without asking.

It can also [switch persona](/abilities/personas) mid-turn, which may switch the model too, and carry on.

A failed tool doesn't end the turn: the model sees the error and can try another way. An ability that can't
load is skipped with a warning, and `kaja doctor` lists what was left out and why. Long conversations are
[compacted](/config/settings#context) into a summary before they outgrow the model's window; the log keeps
every message.

Conversations, memory notes and dataset answers live in a store the host provides: a
[SQLite file](/config/storage) locally, Postgres in the cloud.

[Inside Nasi](/abilities/inside-nasi) shows the whole loop and how it works under the hood.

---

Next:

[Personas](/abilities/personas){: .btn .btn-green .fs-5 }
