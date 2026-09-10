---
layout: page
title: Development
nav_order: 12
---

# Development

The whole project is one Bun monorepo — three apps, four packages, no build orchestrator beyond
Bun workspaces.

## Repository map

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart TD
    subgraph Apps["apps/"]
        API["<b>api</b><br>Hono + Better Auth<br>REST, /nasi, /widget"]
        WEB["<b>web</b><br>TanStack Start<br>landing + admin portal"]
        TUI["<b>tui</b><br>Ink terminal client<br>+ Telegram bot"]
        WID["<b>api/widgets</b><br>embeddable browser bundle"]
    end
    subgraph Pkgs["packages/"]
        NASI["<b>nasi</b><br>the agent brain"]
        SCH["<b>schema</b><br>Zod contracts"]
        LOG["<b>logger</b>"]
        SHR["<b>shared</b>"]
    end
    DB[("PostgreSQL")]
    SQL[("SQLite")]

    NASI --> API
    NASI --> TUI
    SCH --> API
    SCH --> WEB
    SCH --> TUI
    SCH --> NASI
    LOG --> API
    LOG --> WEB
    LOG --> TUI
    SHR --> WEB
    SHR --> TUI
    WID --> API
    API --> DB
    TUI --> SQL
    WEB -->|HTTP| API
    TUI -->|"HTTP (cloud mode)"| API
```

| Workspace | What it is |
| --- | --- |
| `apps/api` | Hono REST API — auth, admin config, cloud agent (`/nasi`), [widget](/widget) serving, emails |
| `apps/api/widgets` | the embeddable browser chat bundle, built as part of the API |
| `apps/web` | TanStack Start — public landing site and the [admin portal](/development/web) |
| `apps/tui` | the [terminal client](/tui), Telegram bot, local config and storage |
| `packages/nasi` | the [agent brain](/development/nasi): loop, tools, store interface |
| `packages/schema` | every Zod [schema](/development/schema), in role-based subpaths |
| `packages/logger` | Pino on the server, console in the browser |
| `packages/shared` | small pure utilities |

There is **no mobile app** in this repo.

## Environment

**Required**

- a Bash-compatible shell
- [**Bun**](https://bun.com/docs/installation) — runtime, package manager, test runner, bundler

**Recommended**

- **Docker Compose** for PostgreSQL and a local mail catcher
- **VSCode** (or compatible) with the recommended extensions — TOML schemas and Biome come wired up
- **Claude Code**, **OpenCode**, or any `AGENTS.md`-compatible coding agent

## Setup

```sh
git clone https://github.com/SubZtep/kaja.git
cd kaja
bun install
bunx lefthook install        # git hooks
docker compose up -d db mail
```

The database volume lives in `./pgdata` and the migration files in `apps/api/migrations` run
automatically **on first boot only**. For an existing volume, catch up manually with
`./scripts/db_migration.sh`.

Bootstrap the env files and generate a local auth secret:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
./scripts/create_local_secrets.sh   # appends BETTER_AUTH_SECRET to apps/api/.env
```

## Commands

```sh
bun dev                  # API + web, hot reload
bun dev:api              # just the API
bun dev:web              # just the web app
bun dev:tui              # the terminal client (use this — it passes your TTY through)

bun lint                 # Biome check + tombi TOML format/lint
bun lint:fix             # apply fixes, including unsafe ones
bun typecheck            # tsc --noEmit across every workspace
bun test                 # API integration + CLI unit tests

bun run ./scripts/mass_user_create.ts [n]   # create n random local users (default 10)
bun run scripts/barkochba.ts ["secret"]     # self-play the barkochba persona against a thinker
```

> Use `bun dev:tui`, not `bun run --filter @kaja/tui start`. The workspace script runner doesn't
> pass the TTY through, so Ink fails with "Raw mode is not supported".
{: .warning }

### Code generation

Never hand-edit the outputs of these — the schemas in `packages/schema/` are the source of truth:

```sh
bun generate:env         # apps/*/.env.example from packages/schema/env/*
bun check:env            # fail if any .env.example has drifted
bun generate:env-types   # ambient Bun.Env typings per workspace
bun generate:schemas     # JSON Schemas for the TOML config files
```

All of them run automatically on commit via [lefthook](https://github.com/evilmartians/lefthook)
when their inputs change.

## Git hooks

| Hook | Runs |
| --- | --- |
| `commit-msg` | commitlint (conventional commits) |
| `pre-commit` | `lint:fix`, the generators above (only for changed inputs), `typecheck` |
| `pre-push` | `lint`, `typecheck`, `test` |

They're the reason you rarely need to run these by hand.

## Local URLs

| Service | Where |
| --- | --- |
| PostgreSQL | `postgresql://testuser:testpass@localhost:5433/kaja` |
| MailDev SMTP | `localhost:1025` |
| MailDev inbox | [`http://localhost:1080`](http://localhost:1080) |
| API | [`http://localhost:3001`](http://localhost:3001) |
| API reference (dev only) | [`http://localhost:3001/reference`](http://localhost:3001/reference) |
| Web | [`http://localhost:3000`](http://localhost:3000) |

## Environment variables

Each app under `apps/*/` ships two env files:

| File | Committed | Purpose |
| --- | --- | --- |
| `.env.example` | yes | generated template, no real values |
| `.env` | no (gitignored) | your local copy with real values |

Compose build args (`VITE_API_URL`, `VITE_APP_URL`) default to `localhost`. Override them with a
gitignored root `.env`, which `docker compose` auto-loads for interpolation.

**Production ships no `.env*` files at all** — variables are injected by the host or orchestrator.

## Testing

```sh
bun test                              # everything
bun run --filter @kaja/tui test       # CLI unit tests only
bun run --filter @kaja/nasi test      # agent brain only
```

API integration tests need a running PostgreSQL matching `DATABASE_URL`. The test runner preloads
`apps/api/.env.example` then `apps/api/.env` (wired via `bunfig.toml`), and rate limiting turns
itself off under `bun test`.

CI runs Biome, the env-drift check, and the full test suite against a PostgreSQL service
(`.github/workflows/ci.yaml`); a separate workflow builds and releases the CLI binaries.

---

Next:

[Architecture](/development/nasi){: .btn .btn-green .fs-5 }
