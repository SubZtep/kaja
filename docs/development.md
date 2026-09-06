---
layout: page
title: Development
nav_order: 9
---

# Development

## Summary

The entire project sits in a single monorepo, built with common web and surrounding tools.

It's recommended to let git hooks run to auto-run easily forgottable tasks.

## Environment

You might wanna install these.

### Required

- **Bash**-compatible terminal for executing package commands
- **Bun** JavaScript for runtime and builds

### Recommended

- **VSCode** (or compatible) editor with the recommended extensions and project settings
- **Claude Code**, **OpenCode**, or any _AGENTS.md_-compatible coding agent
- **Docker Compose** for simple services setup

### Good to have

- **FFplay** for sound playback

## Setup

Start PostgreSQL and SMTP services:

```sh
docker compose up -d db mail
```

> This mounts the persistent PostgreSQL data in the `./pgdata` folder. The migration files run automatically on first boot.

## Available commands

From your project root, run in a terminal:

```sh
# Run the API and web app
bun dev

# Run the CLI app
bun dev:cli

# Check formatting and lint rules
bun lint

# Apply formatter and unsafe lint fixes
bun lint:fix

# Run tests
bun run test

# Create multiple random users locally (10 by default, or specify a number)
bun run ./scripts/mass_user_create.ts [number]
```

## Local URLs

- **PostgreSQL**\
  Connection: `postgresql://testuser:testpass@localhost:5433/kaja`
- **MailDev**\
  SMTP: `localhost:1025`\
  Inbox: [`http://localhost:1080`](http://localhost:1080)
- **API**\
  Endpoint: `http://localhost:3001`\
  Reference: [`http://localhost:3001/reference`](http://localhost:3001/reference)
- **Web**\
  Portal: [`http://localhost:3000`](http://localhost:3000)

## Environment Variables

Each app under `/apps/*/` ships two env files:

| Order | File           | Committed?        | Purpose                                     |
| ----- | -------------- | ----------------- | ------------------------------------------- |
| 1     | `.env.example` | yes               | template / source of truth (no real values) |
| 2     | `.env`         | NO (`.gitignore`) | your local copy — real values + secrets     |

Compose build args (`VITE_API_URL`, `VITE_APP_URL`) default to `localhost` in `compose.yaml`. To override, create a root `.env` (gitignored) with the desired values — `docker compose` auto-loads it for variable interpolation.

Production: **no `.env*` files** — inject vars via the host / orchestrator (Disco, Docker `--env-file` outside the image, k8s secrets, etc.).

To use the pre-configured [MCP servers](.mcp.json) locally with **Claude Code**, export `CONTEXT7_API_KEY` and `GITHUB_PAT` environment variables with valid values.

---

Next:

[Deployment](/development/deployment){: .btn .btn-green .fs-5 }
