# 가자⛲

> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
![Build CLI](https://github.com/SubZtep/kaja/actions/workflows/build-cli.yaml/badge.svg)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

This project is built with **Bun** and **TypeScript**, implementing pieces of **Better Auth** in a **Hono API**, a **TanStack Start** web app, and a local _CLI_.

## What’s in the Monorepo?

- **Apps**
  - [`api`](./apps/api/) – Rest API, authentication, database migrations files, and email delivery.
  - [`cli`](./apps/cli/) – Installable CLI app for orchestration tasks.
  - [`mobile`](./apps/mobile/) – Mobile app for mobility.
  - [`web`](./apps/web/) – Public web and admin portal.
- **Packages**
  - [`geo`](./packages/geo/) – Geolocation services.
  - [`logger`](./packages/logger/) – Pino wrapper for backend and frontend.
  - [`schemas`](./packages/schemas/) – Payload and data schemas across the workspaces.
  - [`shared`](./packages/shared/) – Shared utilities (pure functions).

## Quick Start

Working defaults are provided in the [Docker Compose config](compose.yaml) and app `.env.example` files.

```sh
docker compose up -d
```

This command starts:

- **PostgreSQL**\
  Connection string: `postgresql://testuser:testpass@localhost:5433/testdb`
- **MailDev**\
  SMTP: `localhost:1025`\
  Inbox page: [`http://localhost:1080`](http://localhost:1080)
- **API**\
  Base endpoint: `http://localhost:3001`\
  Reference: [`http://localhost:3001/reference`](http://localhost:3001/reference)
- **Web**\
  Page: [`http://localhost:3000`](http://localhost:3000)

This is all the CLI needs to connect:

```sh
bun dev:cli
```

## Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.
