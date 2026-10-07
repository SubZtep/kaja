---
layout: page
title: Nasi
parent: Abilities
nav_order: 1
summary: "The agent at the heart of Kaja and how it loops."
icon: 🌀
---

# ₙ𝐀ₛ𝐈 🧠

### `[̲̅N][̲̅a][̲̅s][̲̅i] [̲̅i][̲̅s] [̲̅t][̲̅h][̲̅e]`<br>`[̲̅m][̲̅o][̲̅s][̲̅t] [̲̅i][̲̅m][̲̅p][̲̅o][̲̅r][̲̅t][̲̅a][̲̅n][̲̅t]`<br>`[̲̅p][̲̅a][̲̅r][̲̅t] [̲̅o][̲̅f] [̲̅K][̲̅a][̲̅j][̲̅a]🤖[̲̅.]`

---

> Think of Nasi as Kaja’s business logic rather than a service. There’s no Nasi server to connect to: it’s a library that whatever hosts it carries along and runs in-process. The terminal app embeds it, the web API embeds it, and so can any future piece of Kaja. Each host gets the same code and the same behaviour, and only supplies the surroundings: a model, a place to store things and a set of tools.
{: .headsup }

Everything else in this section plugs into Nasi: [personas](/abilities/personas) give it a voice,
[skills](/abilities/skills) teach it procedures, [tools](/abilities/tools) (built-in and HTTP)
and [MCP servers](/abilities/mcp) give it hands, and [memory & datasets](/abilities/memory) let it remember
you.

## Where it runs

On your machine in local mode (and `kaja telegram`), and on the Kaja API for cloud mode, the cloud Telegram
bot and the widget. It's the same brain either way. The cloud one gets a smaller toolset because it serves
many people and has no shell. [Cloud or local](/getting-started/modes) has the full comparison.

## What it knows when a conversation starts

Nasi begins a conversation by writing itself a brief, the system prompt, from whatever applies:

1. the active [persona](/abilities/personas)’s instructions (`default` when none is picked);
2. where it runs: your OS in the terminal, or the channel (Telegram, widget);
3. how to use the tools that need care: asking you questions, running shell commands, keeping notes;
4. the other personas it may switch to, and when;
5. the names and descriptions of the persona's [skills](/abilities/skills), and the full text of its sticky ones;
6. a [dataset](/abilities/memory#datasets) to collect, if the persona has one, and what you've already
   answered in your profile;
7. your sticky [memory notes](/abilities/memory#notes);
8. the language to reply in ([Voice & language](/using/voice#language)).

Anything that isn't set up is left out, so a cloud or widget conversation sees a subset of what a local one
does. Turning an ability on or off applies from your next message, even mid-conversation.

## How a turn works

Nasi calls the model, runs the tools it asks for, feeds the results back, and repeats until the model has an
answer. Along the way it can stop and hand control back to you:

- **a question** (`ask_user`): your next message is the answer;
- **an approval**: a shell command, or an HTTP tool or MCP call that changes something, waits for your OK.
  Simple read-only shell commands on your [safe list](/configuration/config#commandstoml-commands-that-run-without-asking) (listing files, `git status`) run without asking;
- **a file on your disk**: in cloud terminal chat, `read_file` and `list_files` run on your machine, not
  on the server.

It can also [switch persona](/abilities/personas) mid-turn, which may switch the model too, and carry on.
The diagram on [Cloud or local](/getting-started/modes#how-a-turn-runs) shows the whole loop.

## When things go wrong

Nasi tries not to leave you with nothing:

- A failed tool doesn't end the turn. The model sees the error and can try another way. After three rounds
  in a row where every tool call failed, it stops.
- An empty reply from the model is retried a few times before Nasi admits it's drawing a blank.
- An ability that can't load (a broken file, a missing key, an MCP server silent for 10 seconds) is skipped
  with a warning, and everything else still works. `kaja doctor` lists what was left out and why.

## Long conversations

Models can only read so much at once, so Nasi keeps each request inside the model's context window:

- A tool result too big for the window (a long web page, a huge file) is condensed for the model. The full
  output stays in the conversation log.
- Images from older turns are replaced with a short note, since the model already saw them.
- When the conversation nears the limit, the older part is **compacted** into a summary and recent messages
  stay as they are. Nothing is deleted: the log keeps every message.

Type `/compact` to do it on demand. Which model writes the summaries, and when compaction kicks in, is in
[Settings](/configuration/config#context).

## What it keeps

Conversations, memory notes and dataset answers live in a store the host provides: a
[SQLite file](/configuration/storage) locally, Postgres in the cloud. Nasi reads no config file and opens no
database itself, which is why one brain fits every front door. How it's built is on
[Agent brain](/development/nasi).

---

Next:

[Personas](/abilities/personas){: .btn .btn-green .fs-5 }
