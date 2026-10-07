---
layout: page
title: Local setup
parent: Development
nav_order: 2
summary: "Run Kaja from source: install, commands, hooks, URLs and tests."
---

# Local setup

## Environment

**Required**

- a Bash-compatible shell
- [**Bun**](https://bun.com/docs/installation): runtime, package manager, test runner and bundler
- [**Biome**](https://biomejs.dev/guides/manual-installation/): linter and formatter for the code
- [**Tombi**](https://tombi-toml.github.io/tombi/docs/installation): formatter and linter for the TOML files

Neither is a dependency, so `bun install` doesn't bring them. Install the versions the repo expects
(`bun scripts/tool.ts biome --pinned`, `bun scripts/tool.ts tombi --pinned`); without a package manager that
has them, `bun add -g @biomejs/biome@<version> tombi@<version>` works too. `bun lint` says what's missing,
and warns when a major.minor version differs from CI's.

**Recommended**

- **Docker Compose** for PostgreSQL, a local mail catcher and S3-compatible object storage (RustFS)
- **VSCode** (or compatible) with the recommended extensions, which wire up TOML schemas and Biome
- **Claude Code** (the agent notes are `CLAUDE.md` files)

## Setup

```sh
git clone https://github.com/SubZtep/kaja.git
cd kaja
bun install
bunx lefthook install        # git hooks
docker compose up -d db mail storage
```

The database volume lives in `./pgdata`, and the migrations in `apps/api/migrations` run **on first boot
only**. After pulling a schema change, see [how the schema is managed](/development/database#how-the-schema-is-managed).

Bootstrap the env files and generate a local auth secret:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/sandbox/.env.example apps/sandbox/.env
cp apps/tui/.env.example apps/tui/.env
cp apps/web/.env.example apps/web/.env
./scripts/create_local_secrets.sh   # appends BETTER_AUTH_SECRET to apps/api/.env
```

The API won't start without `BETTER_AUTH_SECRET`. Run the script once, not on every setup, or it appends a
second line.

## Commands

```sh
bun dev                  # API (with the widget bundle) + web, hot reload
bun dev:api              # just the API
bun dev:web              # just the web app
bun dev:tui              # the terminal client (use this, it passes your TTY through)
bun dev:sandbox          # the MCP sandbox (uses your own Chrome; `docker compose up -d sandbox` for the real image)

bun lint                 # Biome check + tombi TOML format/lint
bun lint:fix             # apply fixes, including unsafe ones
bun typecheck            # tsc --noEmit across every workspace
bun test                 # API integration + CLI unit tests
bun docs                 # this site, with Jekyll (needs Ruby and `bundle install` in docs/)

bun run ./scripts/mass_user_create.ts [n]   # create n random local users (default 10)
bun run scripts/barkochba.ts ["secret"]     # self-play the barkochba persona against a thinker
```

> Use `bun dev:tui`, not `bun run --filter @kaja/tui start`. The workspace runner doesn't pass the TTY
> through, so Ink fails with "Raw mode is not supported".
{: .warning }

### Code generation

Never hand-edit the outputs of these. Their inputs are the source of truth:

```sh
bun generate:env         # apps/*/.env.example from packages/schema/env/*
bun check:env            # fail if any .env.example has drifted
bun generate:env-types   # ambient Bun.Env typings per workspace
bun generate:schemas     # JSON Schemas for the TOML config files (docs/config/schemas)
bun generate:models      # docs/config/models.*.toml from docs/config/catalog.toml
bun check:models         # fail if the model examples have drifted
bun sync:locales         # give every language the en-GB keys, with placeholders for new text
bun check:locales        # fail on drift or untranslated placeholders
```

The generators run on commit through [lefthook](https://github.com/evilmartians/lefthook) whenever their
inputs change.

## Git hooks

Lefthook checks your commit message (conventional commits), runs the generators and `lint:fix` and
`typecheck` on commit, and `lint`, `typecheck` (plus `test` on `main`) and the translations on push. That's
why you rarely run them by hand. [Vibe coding](/development/vibe-coding#git-hooks) has the details.

## Local URLs

| Service | Where |
| --- | --- |
| PostgreSQL | `postgresql://testuser:testpass@localhost:5433/kaja` |
| MailDev SMTP | `localhost:1025` |
| MailDev inbox | [`http://localhost:1080`](http://localhost:1080) |
| API | [`http://localhost:3001`](http://localhost:3001) |
| API reference (dev only) | [`http://localhost:3001/reference`](http://localhost:3001/reference) |
| Web | [`http://localhost:3000`](http://localhost:3000) |
| Object storage (RustFS) S3 API | `http://localhost:9000` (key `kaja`, secret `kaja-dev-storage`) |
| Object storage console | [`http://localhost:9001`](http://localhost:9001) |

## Environment variables

Each app under `apps/*/` has two env files:

| File | Committed | Purpose |
| --- | --- | --- |
| `.env.example` | yes | generated template, no real values |
| `.env` | no (gitignored) | your local copy with real values |

Never edit `.env.example` by hand. It's generated from `packages/schema/env/*` (see
[code generation](#code-generation)). Compose build args (`VITE_API_URL`, `VITE_APP_URL`) default to
`localhost`. Override them with a gitignored root `.env`, which `docker compose` loads on its own.

**Production ships no `.env*` files at all.** The host or orchestrator injects the variables.

## Testing

```sh
bun test                              # everything
bun run --filter @kaja/tui test       # CLI unit tests only
bun run --filter @kaja/nasi test      # agent brain only
```

Run `bun test` from the repo root. API integration tests need a running PostgreSQL matching `DATABASE_URL`,
but use their own database, `<dev database>_test` beside it (or `TEST_DATABASE_URL`). It's rebuilt from
`apps/api/migrations` whenever those files change, so a running `bun dev` can't race the tests. The runner
preloads `apps/api/.env.example` then `apps/api/.env` (via `bunfig.toml`), and rate limiting turns itself
off under `bun test`. `bun test:tz` reruns the date-sensitive tests in three far-apart time zones.

CI runs Biome, the type checker, the env-drift check and the full test suite against a PostgreSQL service
with the migrations applied and the config seeded (`.github/workflows/ci.yaml`). A separate workflow builds
and releases the CLI binaries.

---

Next:

[Agent brain](/development/nasi){: .btn .btn-green .fs-5 }
