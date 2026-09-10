---
layout: page
title: Vision
parent: Development
nav_order: 12.6
---

# Vision

Where the pieces sit, and why the shape is what it is.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart LR
  U@{ shape: curv-trap, label: "👤 Browser" }
  UT@{ shape: notch-rect, label: "👤 Terminal" }
  UG@{ shape: curv-trap, label: "🌐 Someone else's site" }
  L@{ shape: manual-file, label: "Ollama / llama.cpp<br><big>🦙</big>" }
  C@{ shape: manual-file, label: "Cloud provider<br><big>☁️</big>" }

  D[(PostgreSQL)]
  S[(SQLite)]
  E@{ shape: docs, label: "👤 Emails"}

  subgraph MR["`**monorepo**`"]
    A["📁 <b>apps/api</b><br/>Hono · Better Auth<br/>/nasi · /widget"]
    W["📁 <b>apps/web</b><br/>TanStack Start<br/>landing + admin"]
    T["📁 <b>apps/tui</b><br/>Ink CLI<br/>+ Telegram bot"]
    N["📁 <b>packages/nasi</b><br/>the agent loop"]
    P["📁 <b>packages/*</b><br/>schemas · logger · utils"]
  end

  P -.-> A
  P -.-> W
  P -.-> T
  N --> A
  N --> T

  U -- HTTPS --- W
  UG -- "widget script" --- A
  UT -- "cloud mode" --- A
  UT -- "local mode" --> N
  W -- HTTP --- A
  A <==> D
  T <==> S
  A -- SMTP --> E
  T <==> L
  T <==> C
  A <==> C
```

## The three ideas

**One brain, many hosts.** The agent loop lives in `packages/nasi` and knows nothing about
terminals, HTTP, or databases. Everything that wants an answer — the CLI, the API, the widget —
constructs it with a store and a model client and drives the same loop. Adding a fourth front door
means writing a host, not another agent.

**Offline-first is a real option, not a marketing line.** In [local mode](/modes) there is no
account, no server, and no telemetry: config is plain TOML you can read, state is one SQLite file
you can delete, and pointed at Ollama or llama.cpp it needs no internet connection at all.

**The cloud path is the same product, minus your machine.** Cloud mode exists so someone can try
Kaja without an API key, not as a different app. Same loop, same tools minus the ones that would
reach into a server's filesystem, same personas and memory — just running somewhere else, against
an account.

## Deliberate non-goals

- **No mobile app.** Terminal, Telegram, and the browser widget cover the ground.
- **No ORM.** Raw parameterized SQL and hand-written row mappers; the schema is small enough that
  the abstraction would cost more than it saves.
- **No plugin marketplace.** Tools are a `.ts` file you drop in a directory, and MCP already
  standardizes the rest.

---

[Back to the start](/){: .btn .btn-green .fs-5 }
