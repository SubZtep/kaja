# 가자⛲

> [! IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)

![Build CLI](https://github.com/SubZtep/kaja/actions/workflows/build-cli.yaml/badge.svg)

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

Stack sandbox with **Bun** and **TypeScript**: **Better Auth** on a **Hono API**, a **TanStack Start** web app, and a local **Ink** terminal agent (**CLI**). There is no mobile app in this monorepo.

## What’s in the Monorepo?

* **Apps** 
  + [`api`](./apps/api/) – Rest API, authentication, database migrations files, and email delivery.
  + [`cli`](./apps/cli/) – Installable CLI agent (personas, tools, MCP, Telegram).
  + [`web`](./apps/web/) – Public web and admin portal.
* **Packages** 
  + [`logger`](./packages/logger/) – Pino wrapper for backend and frontend.
  + [`schema`](./packages/schema/) – Payload and data schemas across the workspaces.
  + [`sdk`](./packages/sdk/) – API SDK for app clients.
  + [`shared`](./packages/shared/) – Shared utilities (pure functions).

## Quick Start

Working defaults are provided in the [Docker Compose config](compose.yaml) and app `.env.example` files.

```sh
docker compose up -d db mail
```

This command starts:

* PostgreSQL
* MailDev
* ~~API~~ 
* ~~Web~~ 

Start API and web:

```sh
bun dev
```

This is all the CLI needs to connect:

```sh
bun dev:cli
```

## Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.
