---
layout: home
title: Home
nav_order: 1
---

# Welcome to our documentation 🦋

## What is Kaja?

_Work In Progress 🚧_

## Architecture

```mermaid
flowchart LR
  subgraph "`**User Home**`"
    U((Browser))
    UW((Terminal))
    O["🦞 OpenClaw"]
  end

  subgraph "`**Server**`"
    D[(PostgreSQL)]
    E{{Emails}}
  end

  subgraph "`**This monorepo**`"
    A["📁 apps/api<br/>Hono API<br/>Better Auth"]
    W["📁 apps/web<br/>TanStack Start<br/>React + SSR"]
    P["📁 packages/*<br/>Zod schemas<br/>shared utilities"]
    WW["📁 apps/cli<br/>CLI to drive OpenClaw"]
  end

  P -.-> A
  P -.-> W
  P -.-> WW

  U -- Web --- W
  UW -- HTTP --- A
  UW <--> O
  WW -.-> UW

  W -- HTTP --- A
  A <--> D
  A -- SMTP --> E
```

---

## [Kaja.io Legal](#legal)

- [Privacy Policy](/privacy)
- [Terms of Service](/terms)

[Open **Configuration**](/configuration){: .btn .btn-green }
