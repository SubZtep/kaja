# 가자⛲

> [!IMPORTANT]
> Kaja is still evolving, but the current focus is authentication, admin workflows, and local orchestration.

![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
![Build CLI](https://github.com/SubZtep/kaja/actions/workflows/build-cli.yaml/badge.svg)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)

This project is a Bun TypeScript monorepo that implements pieces of **Better Auth** in a **Hono API**, a **TanStack Start** web app, and a local CLI.

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

## Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.
