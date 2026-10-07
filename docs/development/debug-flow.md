---
layout: page
title: Debug flow
parent: Development
nav_order: 11
summary: "Dump a terminal conversation to markdown and see what happened."
icon: 🐞
---

# Debug flow

When a terminal conversation goes sideways, dump it to markdown and read what happened: every message, tool
call and result, plus a Mermaid sequence diagram of the turn flow.

The script is read-only. It opens the local `memory.sqlite`, never creates or migrates it, and only sees
terminal sessions, not cloud ones.

## List sessions

```bash
bun session list
```

Prints terminal sessions, newest first, with their ids.

## Dump one

```bash
bun session dump 01a0c1f7-2d5f-708d-b7c0-0675bb7b9597 > test.local.md
```

Writes the session as markdown to stdout. Redirect it to a `*.local.md` file (gitignored) and open it in
anything that renders Mermaid. A unique prefix of the id works too: `bun session dump 01a0c1f7`.

---

Next:

[Back to the start](/){: .btn .btn-green .fs-5 }
