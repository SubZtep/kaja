# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Kaja is an AI assistant you talk to from your terminal. Give it a task and it keeps looping with an LLM, using tools and switching personas as needed, until the job is done. Point it at a local model or a cloud one, chat with it in the terminal, on Telegram, or through a widget on your own website.

Under the hood it is a full-stack playground: a **Hono API** secured by **Better Auth**, a **TanStack Start** web app, and a **React Ink** terminal agent. All **TypeScript**, all **Bun**, one repo.

## Try it

```bash
curl -fsSL https://kaja.io/install.sh | bash   # macOS / Linux
kaja
```

That's cloud mode — approve a device code in the browser and start chatting, no API key of your own. Run `kaja --local` instead to run the agent loop on your machine against your own provider; the first run writes `~/.config/kaja/` for you to fill in.

## Hacking on it

You need [Bun](https://bun.com/docs/installation) and [Docker Compose](https://docs.docker.com/compose/install/).

```bash
git clone https://github.com/SubZtep/kaja.git
cd kaja
bun install
bunx lefthook install       # lint on commit, test on push
docker compose up -d db mail
bun dev                     # API + web portal, hot reload
bun dev:tui                 # the terminal client
```

`docker compose up -d` (no service names) additionally builds and runs the API and web images.

## What's inside

**Apps**

- [`api`](./apps/api/)
  - REST API and cloud agent (`/nasi`)
  - Authentication and database migrations
  - Email sending and templates
  - [Widget](./apps/api/widgets/) bundle served to third-party sites
- [`tui`](./apps/tui/)
  - Terminal UI for the AI agent
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

Until it reaches its 1st major version the codebase is under constant refactor. Install the [git hooks](lefthook.toml) with `bunx lefthook install` — they lint on commit and run the tests on push, so the easily forgotten chores take care of themselves.

## Documentation

Want the full story? Head to [docs.kaja.io](https://docs.kaja.io).
