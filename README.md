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
  + [`web`](./apps/web/) – Public homepage and admin portal
  + [`widget`](./apps/widget/) – Web components
* **Packages** 
  + [`logger`](./packages/logger/) – Pino logger for backend and frontend.
  + [`nasi`](./packages/nasi/) – The AI harness
  + [`schema`](./packages/schema/) – Shared request schemas and types
  + [`shared`](./packages/shared/) – Shared utilities (pure functions)

---

## ![Kaja](https://kaja.io/monster.gif)

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

Fetch config[^1], clone or download the source in a terminal, and run with [compose config](compose.yaml):

```bash
docker compose up -d
```

- Setup PostgreSQL and run database migration
- Start MailDev SMTP server with web inbox
- API
- Web

This is all the CLI needs to connect:

```sh
bun dev:cli
```

### Configuration files


```ini
~/.config/kaja/
├─ datasets/*.json  # custom fields for personas to collect
├─ personas/*.toml  # one behaviour per file
├─ mcp.toml         # model context protocol servers
├─ models.toml      # model catalog per provider
├─ services.toml    # external service definitions and endpoints
├─ secrets.toml     # user’s secret keys and tokens
└─ settings.toml    # optional settings and app preferences"
```

### Documentation

See [GitHub Pages](https://docs.kaja.io) for more details.

[^1]: exec `kaja dev:cli --local config fetch`
