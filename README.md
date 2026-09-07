# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)


> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Kaja is a full-stack AI playground: a **Hono API** secured by **Better Auth**, a **TanStack Start** web app, and a terminal AI agent (built with **React Ink**) that follows you into Telegram. All **TypeScript**, all **Bun**, one repo.

## What's in the Monorepo?

* **Apps** 
  + [`api`](./apps/api/) – Rest API, authentication, database migrations files, email delivery, and the embeddable widget bundle (`apps/api/widgets`)
  + [`cli`](./apps/cli/) – AI Agent TUI
  + [`web`](./apps/web/) – Public homepage and admin portal
* **Packages** 
  + [`logger`](./packages/logger/) – Pino logger for backend and frontend.
  + [`nasi`](./packages/nasi/) – The AI harness
  + [`schema`](./packages/schema/) – Shared request schemas and types
  + [`shared`](./packages/shared/) – Shared utilities (pure functions)

## Run on your machine

Prepare:

1. Be sure [Docker Compose](https://docs.docker.com/compose/install/) is installed
2. Clone or download the source

Pick one of two ways to run it:

### Option A: everything in Docker

The [compose config](compose.yaml) defaults just work — open a terminal and start:

```bash
docker compose up -d
```

### Option B: Docker for the backing services only

Just want Postgres and MailDev in containers, with the API and web app running locally (hot reload, breakpoints, etc.)? Install dependencies and copy the env examples:

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Start PostgreSQL (runs the database migrations on first init) and MailDev:

```bash
docker compose up -d db mail
```

Then, in another terminal, start the API and web app together:

```bash
bun dev
```

### Talking to it from the CLI

However you started the stack above, the CLI is the same:

```sh
bun dev:cli
```

By default it talks to the hosted API. To run the CLI's agent loop locally instead (own LLM provider, no hosted API), pass `--local` and fetch the config templates first:

```sh
bun dev:cli --local config fetch
bun dev:cli --local
```

## Git hooks

It is recommended to run [git hooks](lefthook.toml) for common, easily forgotten helper tasks.

## Documentation

Want the full story? Head to [GitHub Pages](https://docs.kaja.io).
