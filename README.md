# 가자⛲

![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/SubZtep/kaja)
![Continuous integration](https://github.com/SubZtep/kaja/actions/workflows/ci.yaml/badge.svg)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=SubZtep_kaja&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=SubZtep_kaja)


> [!IMPORTANT]
> Kaja is still evolving :speaker::godmode::loudspeaker:

Stack sandbox with **Bun** and **TypeScript**: **Better Auth** on a **Hono API**, a **TanStack Start** web app, and a local **React Ink** terminal AI agent with Telegram support.

## What’s in the Monorepo?

* **Apps** 
  + [`api`](./apps/api/) – Rest API, authentication, database migrations files, and email delivery
  + [`cli`](./apps/cli/) – AI Agent TUI
  + [`openai`](./apps/openai/) – Proxy for external LLMs
  + [`web`](./apps/web/) – Public homepage and admin portal
  + [`widget`](./apps/widget/) – Web components
* **Packages** 
  + [`logger`](./packages/logger/) – Pino logger for backend and frontend.
  + [`nasi`](./packages/nasi/) – The AI harness
  + [`schema`](./packages/schema/) – Shared request schemas and types
  + [`shared`](./packages/shared/) – Shared utilities (pure functions)

---

![](https://kaja.io/monster.gif)

### Download build and install

```bash
# Install
curl -fsSL https://kaja.io/install.sh | bash

# Run
kaja --help

# Uninstall
rm ~/.local/bin/kaja
```

### Run in containers

Clone or download source and run with [Docker Compose](compose.yaml):

```bash
docker compose up -d
```

- Setup PostgreSQL and run database migration
- Start MailDev SMTP server with web inbox
- API
- Web
- OpenAI LLM API

This is all the CLI needs to connect:

```sh
bun dev:cli
```

## Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.
