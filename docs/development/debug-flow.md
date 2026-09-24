---
layout: page
title: Debug flow
parent: Development
nav_order: 8
---

# Debug flow

When a terminal conversation goes sideways, dump it to markdown and read what actually happened —
every message, tool call and result, plus a Mermaid sequence diagram of the turn flow.

The script is read-only: it opens the local `memory.sqlite`, never creates or migrates it, and only
sees terminal sessions (not cloud ones).

## List sessions

```bash
bun session list
```

Prints terminal sessions, newest first, with their ids.

## Dump one

```bash
bun session dump 01a0c1f7-2d5f-708d-b7c0-0675bb7b9597 > test.local.md
```

Writes the session as markdown to stdout — redirect it to a `*.local.md` file (gitignored) and open it
in any viewer that renders Mermaid. The id may be a unique prefix, so `bun session dump 01a0c1f7` works too.
