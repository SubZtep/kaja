# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)


> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Stack sandbox with **Bun** and **TypeScript**: **Better Auth** on a **Hono API**, a **TanStack Start** web app, and a local **React Ink** terminal AI agent with Telegram support.

## What’s in the Monorepo?

* **Apps** 
  + [`api`](./apps/api/) – Rest API, authentication, database migrations files, email delivery, and the embeddable widget bundle (`apps/api/widgets`)
  + [`cli`](./apps/cli/) – AI Agent TUI
  + [`web`](./apps/web/) – Public homepage and admin portal
* **Packages** 
  + [`logger`](./packages/logger/) – Pino logger for backend and frontend.
  + [`nasi`](./packages/nasi/) – The AI harness
  + [`schema`](./packages/schema/) – Shared request schemas and types
  + [`shared`](./packages/shared/) – Shared utilities (pure functions)

### Run local development

Clone or download the source, install dependencies, and copy the env examples:

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Start PostgreSQL (runs the database migrations on first init) and MailDev, using the [compose config](compose.yaml):

```bash
docker compose up -d db mail
```

Then start the API and web app together:

```bash
bun dev
```

The CLI talks to this hosted API by default:

```sh
bun dev:cli
```

To run the CLI's agent loop locally instead (own LLM provider, no hosted API), pass `--local` and fetch the config templates first:

```sh
bun dev:cli --local config fetch
bun dev:cli --local
```

### Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.
