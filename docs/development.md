---
layout: page
title: Development
nav_order: 8
---

# Development

## Setup

Start PostgreSQL and SMTP services:

```sh
docker compose up -d db mail
```

> Mounts the persistent PostgreSQL data in the `./pgdata` folder. The migration files run automatically on first boot.

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

# Run test
bun run test

# Post multiple random jobs locally (10 or given)
bun run ./apps/api/scripts/mass_post_jobs.ts [number]

# Create multiple random users locally (10 or given)
bun run ./apps/api/scripts/mass_user_create.ts [number]
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

[Open the **deployment** page](/deployment){: .btn .btn-green .fs-5 }
