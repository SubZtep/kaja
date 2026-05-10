# 가자⛲

> [!IMPORTANT]
> Kaja is still evolving, but the current focus is authentication, admin workflows, and local orchestration.

![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
![Build CLI](https://github.com/SubZtep/kaja/actions/workflows/build-cli.yaml/badge.svg)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

This project is a Bun TypeScript monorepo that implements pieces of **Better Auth** in a **Hono API**, a **TanStack Start** web app, and a local CLI. See the [documentation page](https://docs.kaja.io) for details.

## What is in here?

- [`apps/api`](./apps/api/) - Rest API, authentication, database migrations, and email delivery.
- [`apps/web`](./apps/web/) - Public web and admin portal.
- [`apps/cli`](./apps/cli/) - Installable CLI app for orchestration tasks.
- [`packages/*`](./packages/) - Shared schemas and utilities.

## Quick Start

Working defaults are provided in the [Docker Compose config](compose.yaml) and app `.env.example` files.

```sh
docker compose up -d
```

This starts:

- PostgreSQL
- MailDev SMTP
- API
- Web

## Local Development

Copy the committed env templates into local `.env` files:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/cli/.env.example apps/cli/.env
```

Generate a local Better Auth secret:

```sh
./scripts/create_local_secrets.sh
```

Start the database and SMTP servers:

```sh
docker compose up -d db mail
```

> Mounts the persistent PostgreSQL data in the `./pgdata` folder. The migration files run automatically on first boot.

## Terminal Commands

Run these from the project root:

```sh
bun dev          # Run the API and web app
bun dev:cli      # Run the CLI app
bun lint         # Check formatting and lint rules
bun lint:fix     # Apply formatter and unsafe lint fixes
```

## Local URLs

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:3001](http://localhost:3001)
- Email inbox: [http://localhost:1080](http://localhost:1080)
- API reference: [http://localhost:3001/reference](http://localhost:3001/reference)

## Documentation

- [Development](./docs/dev.md)
- [Configuration](./docs/config.md)
- [Deployment](./docs/deploy.md)
- [**GitHub Pages**](https://docs.kaja.io)
