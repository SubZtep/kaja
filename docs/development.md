---
layout: page
title: Development
nav_order: 3
---

# Development

## Setup

Start PostgreSQL and SMTP services:

```sh
docker compose up -d db mail
```

> Mounts the persistent PostgreSQL data in the `./pgdata` folder. The migration files run automatically on first boot.

## Available commands

Run from your project root in a ***nix** system:

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
./scripts/mass_post_jobs.ts [number]

# Create multiple random users locally (10 or given)
./scripts/mass_user_create.ts [number]
```

## Local URLs


- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001)
- Email inbox: [http://localhost:1080](http://localhost:1080)
- API reference (dev mode only): [http://localhost:3001/reference](http://localhost:3001/reference)

## Environment Variables

Each app under `/apps/*/` ships two env files:

| Order | File           | Committed?        | Purpose                                     |
| ----- | -------------- | ----------------- | ------------------------------------------- |
| 1     | `.env.example` | yes               | template / source of truth (no real values) |
| 2     | `.env`         | NO (`.gitignore`) | your local copy — real values + secrets     |

Compose build args (`VITE_API_URL`, `VITE_APP_URL`) default to `localhost` in `compose.yaml`. To override, create a root `.env` (gitignored) with the desired values — `docker compose` auto-loads it for variable interpolation.

Production: **no `.env*` files** — inject vars via the host / orchestrator (Disco, Docker `--env-file` outside the image, k8s secrets, etc.). See [Deploy](deploy.md).

---

Next:

[Open the **API app** page](/api){: .btn .btn-blue .fs-5 }
