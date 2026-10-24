---
layout: page
title: Local storage
parent: Configuration
nav_order: 5
summary: The local SQLite file and what it holds.
icon: 💾
---

# Local storage

In [local mode](/start/modes) everything Kaja remembers lives in one SQLite file on your machine,
by default in `~/.local/share/kaja/` (XDG). Change that with `[memory] dbPath` in
[`settings.toml`](/config/settings). `kaja config paths` prints the resolved location.

The file opens in WAL mode, so the terminal chat and the Telegram bot can run at the same time.

Images the model was shown (a screenshot a tool returned, a photo sent to the bot) aren't in the database.
Each is a file under `files/images/<sessionId>/` next to it, stored once per session and named by its
sha256. Messages refer to them, and deleting a session removes its folder. `kaja images` counts them,
`kaja images describe` writes the missing descriptions, and `kaja images clean` removes leftovers.

In cloud mode there's no local database: the same data lives in the server's Postgres, under your account.

## Tables

The tables have the same names and columns as the cloud's Postgres ones, so `user_id` is there too; locally it is
always the same fixed id. Open the file with any SQLite tool to see the columns.

| Table                  | Holds                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nasi_note`            | the agent's long-term [memory](/abilities/memory) about you                                                                                                                                   |
| `nasi_session`         | one row per conversation, listed by `kaja sessions` and resumable with `-c` / `-s`, with the tools you allowed for the rest of it                                                             |
| `nasi_message`         | the conversation itself, one row per message (assistant rows are its steps, with model, tokens and latency)                                                                                   |
| `nasi_tool_call`       | every tool call the assistant made, linked to its result message, with how it went and how long it took. A result too big for the context also keeps the condensed version the model was sent |
| `nasi_session_summary` | each summary a long conversation was [compacted](/config/settings#context) into. The messages themselves are never deleted                                                                    |
| `nasi_model_call`      | each request besides the conversation's own (compacting, condensing, the `summarize` tool, describing an image): model, tokens and time                                                       |
| `nasi_session_event`   | the terminal timeline (what the screen showed), replayed when you resume                                                                                                                      |
| `nasi_image`           | what is known about each saved image: size, where it came from, its description                                                                                                               |
| `nasi_dataset_answer`  | individual answers to a [dataset](/abilities/memory#datasets) field                                                                                                                           |
| `nasi_dataset_version` | marks a dataset as completed at a point in time                                                                                                                                               |

`owner` separates rows within one file: empty for the terminal (`null` in `nasi_session`), a namespaced id for a
Telegram user. Sessions belonging to another owner can't be resumed.

## Deleting it

Close Kaja (and the Telegram bot), then delete the file, any `-wal` and `-shm` files beside it, and the
`files/` folder next to it. That wipes all memory, history and saved images. There's nothing else to clean
up.

---

Next:

[Doctor & troubleshooting](/config/commands){: .btn .btn-green .fs-5 }
