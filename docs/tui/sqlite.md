---
layout: page
title: Sqlite
parent: Terminal UI
nav_order: 4.1
---

# SQLite

Sensitive user data.

## Tables

- **notes** — Agent’s memory about the user
- **sessions** — Chat log
- **dataset_answers** — User answers
- **dataset_versions** — Groups individual key-value answers into complete, timestamped versions for each topic and owner

## Schema

```mermaid
erDiagram
  notes {
    key TEXT
    content TEXT
    importance low-medium-high
    tags TEXT
    sticky INTEGER
    createdAt TEXT
    lastUserAt TEXT
    useCount INTEGER
  }

  sessions {
    id TEXT
    createdAt TEXT
    updatedAt TEXT
    oersona TEXT
    model TEXT
    title TEXT
    owner TEXT
    session TEXT
    events TEXT
  }

  dataset_answers {
    topic TEXT
    owner TEXT
    version INTEGER
    field TEXT
    value TEXT
    answeredAt TEXT
  }

  dataset_versions {
    topic TEXT
    owner TEXT
    version INTEGER
    completedAt TEXT
  }

  dataset_answers }o--|| dataset_versions : ""
```
