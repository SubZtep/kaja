# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Kaja is an AI assistant you talk to from your terminal. Give it a task and it keeps looping with an LLM, using tools and switching personas as needed, until the job is done. Point it at a local model or a cloud one, chat with it in the terminal, on Telegram, or through a widget on your own website.

Under the hood it is a full-stack playground: a **Hono API** secured by **Better Auth**, a **TanStack Start** web app, and a **React Ink** terminal agent. All **TypeScript**, all **Bun**, one repo.

## Quick start

You need [Bun](https://bun.com/docs/installation) and [Docker Compose](https://docs.docker.com/compose/install/).

```bash
git clone https://github.com/SubZtep/kaja.git
cd kaja
bun install
docker compose up -d   # database, mail, API and web portal
bun dev:tui            # start chatting
```

By default the TUI talks to the hosted API. To run the agent loop on your own machine with your own LLM provider, pass `--local`. The first time, fetch the config templates:

```bash
bun dev:tui --local config fetch
bun dev:tui --local
```

Hacking on the API or web app? `bun dev` runs both with hot reload.

## What's inside

**Apps**

- [`api`](./apps/api/)
  - REST API
  - Authentication
  - Database migrations
  - Email sending and templates
  - Web component widget bundle
- [`tui`](./apps/tui/)
  - Terminal UI for AI agent
  - Telegram bot
- [`web`](./apps/web/)
  - Public homepage
  - Admin portal

**Packages**

- [`nasi`](./packages/nasi/) – the agent brain: the loop, tools, and memory
- [`schema`](./packages/schema/) – shared Zod schemas and types
- [`logger`](./packages/logger/) – Pino logger for backend and frontend
- [`shared`](./packages/shared/) – small pure utilities

## Contributing

Until it reach the 1st major version, the codebase under constantly refactor. Install the [git hooks](lefthook.toml) with `bunx lefthook install`. They lint on commit and run the tests on push, so the easily forgotten chores take care of themselves.

## Documentation

Want the full story? Head to [docs.kaja.io](https://docs.kaja.io).
