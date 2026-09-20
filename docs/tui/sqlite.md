---
layout: page
title: Storage
parent: Terminal UI
nav_order: 5.1
---

# Local storage

In [local mode](/modes) everything Kaja remembers lives in one SQLite file on your machine —
`~/.local/share/kaja/` by default (XDG), overridable with `[memory] dbPath` in
[`settings.toml`](/configuration/config). `kaja config paths` prints the resolved location.

It opens in WAL mode, so it's safe to have the terminal chat and the Telegram bot running at once.

In cloud mode there is no local database — the same data lives in the server's Postgres, scoped to
your account (the cloud keeps the messages and tool calls, but not the terminal's `session_events` timeline).

The [Database](/development/database) page has the Postgres schema and a side-by-side comparison with this file.

## Tables

| Table | Holds |
| --- | --- |
| `notes` | the agent's long-term [memory](/memory) about you |
| `sessions` | one row per conversation, resumable with `-c` / `-s` |
| `messages` | the conversation itself, one row per message (the assistant's rows are its steps, with model, tokens and latency) |
| `tool_calls` | every tool call the assistant made, linked to its result message, with how it went and how long it took |
| `session_events` | the terminal timeline (what the screen showed), replayed when you resume |
| `dataset_answers` | individual answers to a [dataset](/memory#datasets) field |
| `dataset_versions` | marks a dataset as completed at a point in time |

`owner` namespaces rows within one file: `null` for the terminal, a namespaced id for a Telegram
user or a widget visitor. Sessions belonging to a different owner cannot be resumed.

```mermaid
erDiagram
  notes {
    TEXT key PK
    TEXT content
    TEXT importance "low | medium | high"
    TEXT tags
    INTEGER sticky
    TEXT createdAt
    TEXT lastUsedAt
    INTEGER useCount
  }

  sessions {
    TEXT id PK "UUIDv7"
    TEXT createdAt
    TEXT updatedAt
    TEXT persona
    TEXT model
    TEXT title
    TEXT owner "null = terminal"
    TEXT systemPrompt
    TEXT pendingCallId "a call waiting on the human"
    TEXT pendingKind
  }

  messages {
    TEXT id PK "UUIDv7"
    TEXT sessionId FK
    INTEGER seq
    TEXT role
    TEXT content
    TEXT parts "JSON: image parts"
    TEXT reasoning
    TEXT toolCallId "on tool results"
    TEXT persona "assistant rows: the round's numbers"
    TEXT model "the model that served the round"
    INTEGER promptTokens
    INTEGER completionTokens
    INTEGER latencyMs
    TEXT finishReason
    TEXT createdAt
  }

  tool_calls {
    TEXT id PK "UUIDv7"
    TEXT messageId FK
    INTEGER position
    TEXT callId "the provider's id"
    TEXT name
    TEXT arguments
    TEXT resultMessageId FK
    TEXT status "ok | error | declined | skipped"
    INTEGER durationMs
    TEXT approval "approved | declined"
  }

  session_events {
    TEXT sessionId PK
    INTEGER seq PK
    TEXT type
    TEXT payload "JSON"
  }

  dataset_answers {
    TEXT topic PK
    TEXT owner PK
    INTEGER version PK
    TEXT field PK
    TEXT value
    TEXT answeredAt
  }

  dataset_versions {
    TEXT topic PK
    TEXT owner PK
    INTEGER version PK
    TEXT completedAt
  }

  sessions ||--o{ messages : has
  sessions ||--o{ session_events : has
  messages ||--o{ tool_calls : makes
  dataset_answers }o--|| dataset_versions : "topic + owner + version"
```

## Deleting it

Closing Kaja and deleting the file wipes all memory and history — there's nothing else to clean
up.
