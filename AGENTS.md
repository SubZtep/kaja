This file provides guidance to LLM agents when working with code in this repository.

## Project Overview

Kaja is a TypeScript monorepo built with Bun:

- **API** (`apps/api`): Hono REST API with Better Auth, node orchestration, PostgreSQL
- **Web** (`apps/web`): TanStack Start frontend — public landing + admin portal
- **CLI** (`apps/cli`): Ink TUI agent chat (personas, tools, MCP, Telegram, optional STT/TTS)
- **Packages**: `@kaja/schema`, `@kaja/sdk`, `@kaja/logger`, `@kaja/shared`

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
| Test env preload | `scripts/load-test-env.ts` (wired via `bunfig.toml` `[test].preload`) |
| Docs / GitHub Pages | `docs/` (includes CLI config templates under `docs/config/`) |
| CLI patch for sixel | `patches/sixel@0.16.0.patch` (repo root) |

## Development Commands

```bash
# PostgreSQL + MailDev (API/web optional via compose)
docker compose up -d db mail

# API + web (hot reload)
bun dev

# CLI (entry is apps/cli/cli.tsx — NOT apps/cli/src/...)
bun run --filter @kaja/cli start
# or: bun run --env-file=apps/cli/.env apps/cli/cli.tsx

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

- **Entry**: `core/server.ts` — Hono app, `SchedulerService`, `CronService`
- **App**: `app.ts` — middleware, route mounts
- **Core**: `db.ts` (pg Pool), `logger.ts`, `rate-limit.ts` (global + auth; auto-off under `bun test`), `cron.ts` (no jobs registered)
- **Features**: `features/auth/`, `features/nodes/`, `features/admin/` (plus health, users, config, reference); shared logic in `services/`
- **Lib**: `lib/geo-client.ts` — external GeoIP service (no local job queue)
- Raw SQL + private row→API mappers; UUIDv7 PKs

### Web (`apps/web/src/`)

- TanStack Router file routes: `_public` (landing, auth, device) and `_admin` (dashboard, nodes, users, profile)
- SDK via `useApiSdk()`; auth client in `hooks/auth-client.ts`
- Generated route tree: `routeTree.gen.ts` (should stay out of Biome; see note below)

### CLI (`apps/cli/`)

- Entry: `cli.tsx` (Ink TUI)
- Agent loop, tools, MCP, personas, sessions, memory, Telegram bot, optional STT/TTS
- Config templates import from monorepo-root `docs/config/`
- Detailed agent notes: `apps/cli/AGENTS.md`

### Packages

| Package | Role |
|---------|------|
| `@kaja/schema` | Zod API contracts + `KAJA_CLI_CLIENT_ID` (single source of truth for API types) |
| `@kaja/sdk` | Typed API client (`KajaAPI`) used by web |
| `@kaja/logger` | Pino (node) / console (browser) with `message, payload?` API |
| `@kaja/shared` | Pure utils (`cn`, dates, strings) |

### Type architecture

- **API contracts** (`Node`, `Command`, request/response schemas): only in `@kaja/schema`
- **DB row types**: private to API services; map with private `#rowTo…` helpers
- **Dates over JSON**: `z.coerce.date()` in schemas
- **Do not** put CLI-local config/persona schemas in `@kaja/schema` (those live under `apps/cli/schemas/`)

### Database migrations (lexicographic order)

1. `2026-03-01-uuidv7.sql` — UUIDv7() via pgcrypto
2. `2026-03-03-better-auth.sql` — Better Auth tables
3. `2026-03-27-node.sql` — `node` + `command` tables and indexes

Applied on first Postgres init via compose volume `apps/api/migrations` → `docker-entrypoint-initdb.d`. Manual: `apps/api/scripts/db_migration.sh`.

### Node orchestration

- Connect / heartbeat / disconnect / list / SSE stream under `/nodes`
- Admin commands under `/admin`
- Scheduler marks nodes inactive on missed heartbeats
- Command allowlist + shell-injection checks in services

## Environment (summary)

**API** (see `apps/api/.env.example`): `CORS_ORIGIN`, `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, SMTP, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`, `GEO_SERVICE_URL`, `GEO_SERVICE_API_KEY`. Optional: `WEB_PUBLIC_URL`, rate-limit window/max vars.

**Web** (see `apps/web/.env.example`): `VITE_API_URL`, `VITE_APP_URL`, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`. Browser env uses Vite `import.meta.env.MODE` (not `NODE_ENV`).

**Compose ports**: Postgres `5433` (testuser/testpass/kaja), MailDev `1080`/`1025`, API `3001`, Web `3000`.

**Production (API)**: `NODE_ENV=production`, strong `BETTER_AUTH_SECRET`, real SMTP, `CORS_ORIGIN` matching the public domain, quieter `KAJA_LOG_LEVEL` (`info`/`warn`).

## Code Style

- Biome (`biome.json`): line width 120, double quotes, semicolons asNeeded, no trailing commas, spaces; organizes imports
- TypeScript: ESNext, bundler resolution, strict, `react-jsx`; workspace deps via `workspace:*`
- Prefer surgical diffs; do not drive-by refactor

## Notes

- CLI config templates import from monorepo-root `docs/config/` (not under `apps/cli/`).
- Rate limiting is enabled in the API (global + stricter `/auth/*`); disabled when `BUN_TEST` is set or `RATE_LIMIT_ENABLED=false`.
- Cron service shell is present but intentionally has no registered jobs (node idle handled by SchedulerService).

## Testing & CI

- `bun test` preloads `apps/api/.env.example` then `apps/api/.env` via `scripts/load-test-env.ts` (configured in `bunfig.toml`)
- API integration tests need a running Postgres matching `DATABASE_URL`
- CLI has a large unit suite under `apps/cli/tests/`
- CI (`.github/workflows/ci.yaml`): Biome lint/format + tests with PostgreSQL service
- Separate workflow builds the CLI

## Import Aliases

- Packages: import by package name (`@kaja/schema`, etc.); each package exports from its root `index.ts`

## Key Dependencies

Bun (packageManager in root `package.json`), Hono, Better Auth, TanStack Start, Zod v4, Biome, Pino. Lockfile is `bun.lock`.

## Agent Guidelines

- Root `CLAUDE.md` only redirects here; per-workspace details live in each package’s `AGENTS.md`
- Do not commit secrets; use `.env` (gitignored) over examples
- Ask before git mutations, large refactors, or new features
- Prefer Context7 MCP for library docs when available
