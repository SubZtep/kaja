# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Stack sandbox with **Bun** and **TypeScript**: **Better Auth** on a **Hono API**, a **TanStack Start** web app, and a local **Ink** terminal agent (**CLI**) with Telegram support.

## What’s in the Monorepo?

* **Apps** 
  + [`api`](./apps/api/) – Rest API, authentication, database migrations files, and email delivery.
  + [`cli`](./apps/cli/) – Terminal based agentic AI (personas, tools, MCP, Telegram).
  + [`openai`](./apps/openai/) – AI proxy
  + [`web`](./apps/web/) – Public web and admin portal.
* **Packages** 
  + [`logger`](./packages/logger/) – Pino wrapper for backend and frontend.
  + [`schema`](./packages/schema/) – Payload and data schemas across the workspaces.
  + [`sdk`](./packages/sdk/) – API SDK for app clients.
  + [`shared`](./packages/shared/) – Shared utilities (pure functions).

## Quick Start

### Release Run

Install:

```bash
curl -fsSL https://kaja.io/setup.sh | bash
```

Execute:

```bash
kaja
```

### Source Run

Download source and run with [working defaults](compose.yaml):

```bash
docker compose up -d
```

This command starts:

- PostgreSQL
- MailDev SMTP
- API
- Web
- ~~OpenAI~~

This is all the CLI needs to connect:

```sh
bun dev:cli
```

## Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.
