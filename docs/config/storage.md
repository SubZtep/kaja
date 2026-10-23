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
sha256. Messages refer to them, and deleting a session removes its folder.

In cloud mode there's no local database: the same data lives in the server's Postgres, under your account.

## Tables

The tables have the same names and columns as the cloud's Postgres ones, so `user_id` is there too; locally it is
always the same fixed id.

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
Telegram user or a widget visitor. Sessions belonging to another owner can't be resumed.

```mermaid
erDiagram
  nasi_note {
    TEXT user_id PK
    TEXT owner PK "empty = terminal"
    TEXT key PK
    TEXT content
    TEXT importance "low | medium | high"
    TEXT tags "JSON"
    INTEGER sticky
    TEXT created_at
    TEXT last_used_at
    INTEGER use_count
  }

  nasi_session {
    TEXT id PK "UUIDv7"
    TEXT user_id
    TEXT created_at
    TEXT updated_at
    TEXT persona
    TEXT model
    TEXT title
    TEXT owner "null = terminal"
    TEXT channel "local | telegram | widget"
    TEXT system_prompt
    TEXT pending_call_id "a call waiting on the human"
    TEXT pending_kind
    TEXT granted_tools "JSON: tools allowed for the session"
  }

  nasi_message {
    TEXT id PK "UUIDv7"
    TEXT session_id FK
    INTEGER seq
    TEXT role
    TEXT content
    TEXT parts "JSON: image parts"
    TEXT reasoning
    TEXT tool_call_id "on tool results"
    TEXT persona "assistant rows: the round's numbers"
    TEXT model "the model that served the round"
    INTEGER prompt_tokens
    INTEGER completion_tokens
    INTEGER latency_ms
    TEXT finish_reason
    TEXT created_at
  }

  nasi_tool_call {
    TEXT id PK "UUIDv7"
    TEXT message_id FK
    INTEGER position
    TEXT call_id "the provider's id"
    TEXT name
    TEXT arguments
    TEXT result_message_id FK
    TEXT status "ok | error | declined | skipped"
    INTEGER duration_ms
    TEXT approval "approved | declined"
    TEXT result_summary "what the model gets instead of an oversized result"
  }

  nasi_session_summary {
    TEXT session_id PK
    INTEGER summary_from PK "seq of the first message it doesn't cover"
    TEXT summary
    TEXT created_at
  }

  nasi_model_call {
    TEXT id PK "UUIDv7"
    TEXT session_id FK
    TEXT kind "compact | condense | summarize | describe"
    TEXT model
    INTEGER prompt_tokens
    INTEGER completion_tokens
    INTEGER latency_ms
    TEXT created_at
  }

  nasi_session_event {
    TEXT session_id PK
    INTEGER seq PK
    TEXT type
    TEXT payload "JSON"
  }

  nasi_image {
    TEXT session_id PK
    TEXT id PK "start of the bytes' sha256"
    TEXT user_id
    TEXT mime_type
    INTEGER width
    INTEGER height
    INTEGER bytes
    TEXT source_url
    TEXT alt
    TEXT title
    TEXT file_name
    TEXT description
    TEXT description_model
    TEXT described_at
    INTEGER describe_attempts
    TEXT describe_tried_at
    TEXT created_at
  }

  nasi_dataset_answer {
    TEXT user_id PK
    TEXT topic PK
    TEXT owner PK
    INTEGER version PK
    TEXT field PK
    TEXT value
    TEXT answered_at
  }

  nasi_dataset_version {
    TEXT user_id PK
    TEXT topic PK
    TEXT owner PK
    INTEGER version PK
    TEXT completed_at
  }

  nasi_session ||--o{ nasi_message : has
  nasi_session ||--o{ nasi_session_event : has
  nasi_session ||--o{ nasi_session_summary : "compacted into"
  nasi_session ||--o{ nasi_model_call : "summarised with"
  nasi_message ||--o{ nasi_tool_call : makes
  nasi_dataset_answer }o--|| nasi_dataset_version : "topic + owner + version"
```

## Deleting it

Close Kaja (and the Telegram bot), then delete the file, any `-wal` and `-shm` files beside it, and the
`files/` folder next to it. That wipes all memory, history and saved images. There's nothing else to clean
up.

---

Next:

[Doctor & troubleshooting](/config/commands){: .btn .btn-green .fs-5 }
