---
layout: page
title: Development
nav_order: 7
has_children: true
---

# Development

The whole project is one Bun monorepo — four apps, three packages, no build orchestrator beyond
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
        SBX["<b>sandbox</b><br>stdio MCP servers<br>for cloud turns"]
    end
    subgraph Pkgs["packages/"]
        NASI["<b>nasi</b><br>the agent brain"]
        SCH["<b>schema</b><br>Zod contracts"]
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
    SHR --> WEB
    SHR --> TUI
    WID --> API
    API --> DB
    TUI --> SQL
    WEB -->|HTTP| API
    TUI -->|"HTTP (cloud mode)"| API
    API -->|"MCP over HTTP"| SBX
    SCH --> SBX
    SHR --> SBX
```

| Workspace | What it is |
| --- | --- |
| `apps/api` | Hono REST API — auth, admin config, cloud agent (`/nasi`), [widget](/widget) serving, emails |
| `apps/api/widgets` | the embeddable browser chat bundle, built as part of the API |
| `apps/web` | TanStack Start — the public landing site and the signed-in [web app](/development/web) (dashboard, abilities, widgets, admin) |
| `apps/tui` | the [terminal client](/tui), Telegram bot, local config and storage |
| `apps/sandbox` | the [MCP sandbox](https://github.com/SubZtep/kaja/tree/main/apps/sandbox#readme): runs stdio MCP servers (a headless Chrome) for cloud turns, one per user, behind an egress proxy that only reaches public addresses |
| `packages/nasi` | the [agent brain](/development/nasi): loop, tools, store interface |
| `packages/schema` | every Zod [schema](/development/schema), in role-based subpaths |
| `packages/shared` | small pure utilities, including the Telegram plumbing both bots share |

The two databases are covered on the [Database](/development/database) page.

## Design ideas

**One brain, many hosts.** The agent loop lives in `packages/nasi` and knows nothing about terminals,
HTTP or databases. Every front door constructs it with a store and a model client and drives the same
loop; adding one means writing a host, not another agent.

**Offline-first is a real option.** In local mode there is no account, no server and no telemetry:
config is plain TOML, state is one SQLite file, and pointed at Ollama or llama.cpp it needs no internet.

**The cloud is the same product, minus your machine.** Cloud mode exists so someone can try Kaja without
an API key: same loop, same personas and memory, without the tools that would reach into a server's
filesystem.

Deliberate non-goals: **no mobile app** (terminal, Telegram and the widget cover it), **no ORM** (raw
parameterized SQL and hand-written row mappers), and **no open publishing** (the marketplace is a
curated folder in this repo).

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
automatically **on first boot only**; after pulling a schema change, see
[how the schema is managed](/development/database#how-the-schema-is-managed).

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
bun dev:sandbox          # the MCP sandbox (uses your own Chrome; `docker compose up -d sandbox` for the real image)

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
| `pre-commit` | `lint:fix`, the generators above and the web route tree (only for changed inputs), `typecheck` |
| `post-commit` | `test`, so a failing suite shows up right after the commit |
| `pre-push` | `lint`, `typecheck` |

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
| MCP sandbox | [`http://localhost:3002/health`](http://localhost:3002/health) |

## Environment variables

Each app under `apps/*/` ships two env files:

| File | Committed | Purpose |
| --- | --- | --- |
| `.env.example` | yes | generated template, no real values |
| `.env` | no (gitignored) | your local copy with real values |

Never edit `.env.example` by hand: it's generated from `packages/schema/env/*` (see
[code generation](#code-generation)). Compose build args (`VITE_API_URL`, `VITE_APP_URL`) default to
`localhost`; override them with a gitignored root `.env`, which `docker compose` auto-loads.

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

CI runs Biome, the type checker, the env-drift check, and the full test suite against a PostgreSQL service
with the migrations applied and the config seeded (`.github/workflows/ci.yaml`); a separate workflow builds
and releases the CLI binaries.

---

Next:

[Agent brain](/development/nasi){: .btn .btn-green .fs-5 }
