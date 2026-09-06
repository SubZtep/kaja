This file provides guidance to LLM agents when working with code in this repository.

## Project Overview

Kaja is a TypeScript monorepo built with Bun:

- **API** (`apps/api`): Hono REST API with Better Auth, PostgreSQL
- **Web** (`apps/web`): TanStack Start frontend — public landing + admin portal
- **CLI** (`apps/cli`): Ink TUI — default talks to the hosted API (`/nasi/*`); `--local` embeds `@kaja/nasi` to run the agent loop locally against your own provider
- **Widget** (`apps/widget`): embeddable browser chat bundle, served by the API at `/widget/widget.js`
- **Packages**: `@kaja/schema`, `@kaja/logger`, `@kaja/shared`, `@kaja/nasi` (agent brain)

There is **no mobile app** in this monorepo.

Device authorization still applies where relevant: Better Auth device flow for API-connected clients; CLI agent features are largely local (LLM config under `~/.config/kaja/`).

## Key File Locations

| What | Path |
|------|------|
| Docker Compose | `compose.yaml` |
| Biome config | `biome.json` (not `biome.jsonc`) |
| Root TS config | `tsconfig.json` |
| Lockfile | `bun.lock` |
| API env examples | `apps/api/.env.example` |
| Web env examples | `apps/web/.env.example` |
| DB migrations | `apps/api/migrations/*.sql` |
| Migration runner | `apps/api/scripts/db_migration.sh` |
| Test env preload | `apps/api/tests/load-test-env.ts` (wired via `bunfig.toml` `[test].preload`) |
| Docs / GitHub Pages | `docs/` (includes CLI config templates under `docs/config/`) |

## Development Commands

```bash
# PostgreSQL + MailDev (API/web optional via compose)
docker compose up -d db mail

# API + web + widget (hot reload)
bun dev

# CLI (entry is apps/cli/cli.ts — NOT apps/cli/src/...)
bun run --filter @kaja/cli start
# or: bun run --env-file=apps/cli/.env apps/cli/cli.ts

# Lint / types / tests
bun lint
bun lint:fix
bun typecheck          # apps/* and packages/* with tsconfig; fails on first error
bun test               # API integration + CLI unit tests
```

### Per-workspace

```bash
bun run --filter @kaja/api dev
bun run --filter @kaja/api build

bun run --filter @kaja/web dev
bun run --filter @kaja/web build

bun run --filter @kaja/cli start
bun run --filter @kaja/cli test
```

## Architecture

### Authentication

- Better Auth (email/password, verification, reset, admin roles, device authorization)
- CLI client id: `KAJA_CLI_CLIENT_ID` from `@kaja/schema` (`"kaja-cli"`)
- Device approval UI: web `/device`
- Session cookies prefixed with `kaja`

### API (`apps/api/src/`)

- **Entry**: `core/server.ts` — Hono app, `CronService`
- **App**: `app.ts` — middleware, route mounts
- **Core**: `db.ts` (pg Pool), `logger.ts`, `rate-limit.ts` (global + auth; auto-off under `bun test`), `cron.ts` (no jobs registered)
- **Features**: `features/auth/`, `features/admin/` (plus health, users, config, reference); shared logic in `services/`
- Raw SQL + private row→API mappers; UUIDv7 PKs

### Web (`apps/web/src/`)

- TanStack Router file routes: `_public` (landing, auth, device) and `_admin` (dashboard, users, profile)
- auth client in `hooks/auth-client.ts`
- Generated route tree: `routeTree.gen.ts` (should stay out of Biome; see note below)

### CLI (`apps/cli/`)

- Entry: `cli.ts` (Ink TUI)
- Agent loop, tools, MCP, personas, sessions, memory, Telegram bot, optional STT/TTS
- Config templates import from monorepo-root `docs/config/`
- Detailed agent notes: `apps/cli/AGENTS.md`

### Packages

| Package | Role |
|---------|------|
| `@kaja/schema` | Zod API contracts + `KAJA_CLI_CLIENT_ID` (single source of truth for API types) |
| `@kaja/logger` | Pino (node) / console (browser) with `message, payload?` API |
| `@kaja/shared` | Pure utils (`cn`, dates, strings) |
| `@kaja/nasi` | Agent loop, sqlite store, tools. Hosted profile is a subset (no shell/files/MCP). |

### Type architecture

- **All Zod schemas live in `@kaja/schema`**, split into role-based subpaths — no bare `@kaja/schema` import, and no app keeps its own local schema files
  - `@kaja/schema/api` — API contracts (request/response schemas), shared by `apps/api`, `apps/web`
  - `@kaja/schema/config` — CLI on-disk config files the user hand-edits (settings.toml, models.toml, mcp.toml, services.toml)
  - `@kaja/schema/store` — CLI SQLite-backed runtime state (sessions, memory notes)
  - `@kaja/schema/cli` — remaining CLI domain concepts (personas, datasets)
  - `@kaja/schema/nasi` — hosted turn request/response
- **DB row types**: private to API services; map with private `#rowTo…` helpers
- **Dates over JSON**: `z.coerce.date()` in schemas
- See `packages/schema/AGENTS.md` for the full layout and naming conventions

### Database migrations (lexicographic order)

1. `2026-03-01-uuidv7.sql` — UUIDv7() via pgcrypto
2. `2026-03-03-better-auth.sql` — Better Auth tables
3. `2026-08-01-config.sql` — `mcp_server`, `provider`, `model` tables

Applied **only on first Postgres init** via compose volume `apps/api/migrations` → `docker-entrypoint-initdb.d`. Existing `pgdata` volumes do **not** auto-apply new files — run `apps/api/scripts/db_migration.sh` (or apply SQL manually).

## Code Style

- Biome (`biome.json`): line width 120, double quotes, semicolons asNeeded, no trailing commas, spaces; organizes imports
- `bun run generate:schemas` regenerates JSON from `packages/schema/tombi`; `bun lint`/`lint:fix` also run `tombi format`/`tombi lint` on TOML files
- TypeScript: ESNext, bundler resolution, strict, `react-jsx`; workspace deps via `workspace:*`
- Prefer surgical diffs; do not drive-by refactor
- Comments: single line, no wrapping. `/** ... */` (TSDoc) for exported functions/values — VSCode surfaces these on hover; `// ...` for internal notes (locals, implementation asides)

## Notes

- A git hooks run lint at commit, and run test before push, so you don't have to run again for double-check after you finished a task.
- CLI config templates import from monorepo-root `docs/config/` (not under `apps/cli/`).

## Testing & CI

- `bun test` preloads `apps/api/.env.example` then `apps/api/.env` via `apps/api/tests/load-test-env.ts` (configured in `bunfig.toml`)
- API integration tests need a running Postgres matching `DATABASE_URL`
- CLI has a large unit suite under `apps/cli/tests/`
- CI (`.github/workflows/ci.yaml`): Biome lint/format + tests with PostgreSQL service
- Separate workflow builds the CLI

## Import Aliases

- Packages: import by package name (`@kaja/schema`, etc.); each package exports from its root `index.ts`

## Key Dependencies

Bun (packageManager in root `package.json`), Hono, Better Auth, TanStack Start, Zod. Lockfile is `bun.lock`.

## Agent Guidelines

- Root `CLAUDE.md` only redirects here; per-workspace details live in each package’s `AGENTS.md`
- Do not commit secrets; use `.env` (gitignored) over examples
- Ask before git mutations, large refactors, or new features
- Prefer Context7 MCP for library docs when available
