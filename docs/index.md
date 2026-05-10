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
---
config:
  look: handDrawn
  theme: dark
---
flowchart LR
  U((Browser))
  UW((Terminal))
  O@{ shape: manual-file, label: "OpenClaw<br><big>🦞</big>" }

  D[(PostgreSQL)]
  E@{ shape: docs, label: "Emails"}

  subgraph "`**monorepo**`"
    A["📁 <strong><u>apps/api</u></strong><br/>Hono API<br/>Better Auth"]
    W["📁 <strong><u>apps/web</u></strong><br/>TanStack Start<br/>React + SSR"]
    P["📁 <strong><u>packages/*</u></strong><br/>Zod schemas<br/>shared utilities<br>GEO tools"]
    WW["📁 <strong><u>apps/cli</u></strong><br/>CLI to drive OpenClaw"]
  end

  P -.-> A
  P -.-> W
  P -.-> WW

  U -- Web --- W
  UW -- HTTP --- A
  UW <==> O
  WW -.-> UW

  W -- HTTP --- A
  A <==> D
  A -- SMTP --> E
```

## Legal

- [Privacy Policy](/privacy)
- [Terms of Service](/terms)

---

Next:

[Open the **configuration** page](/configuration){: .btn .btn-blue .fs-5 }
