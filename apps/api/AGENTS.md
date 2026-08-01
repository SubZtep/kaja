# @kaja/api

Hono REST API for Kaja: Better Auth, node orchestration, admin commands, emails, GeoIP.

## Commands

```bash
# From monorepo root
bun run --filter @kaja/api dev      # hot reload: src/core/server.ts
bun run --filter @kaja/api build    # dist/server.js (bun target)
bun run --filter @kaja/api start

# Tests live at monorepo root (needs Postgres + env)
bun run test
```

Local secrets helper: `scripts/create_local_secrets.sh`  
Manual migrations: `scripts/db_migration.sh`

## Layout

```
src/
  app.ts                 # OpenAPIHono app, CORS, route mounts
  core/
    server.ts            # process entry: scheduler + cron + export default
    db.ts                # pg Pool
    logger.ts            # traffic logger for hono/logger
    rate-limit.ts        # limiters (currently unused from app.ts)
    cron.ts              # Bun.CronJob shell (no jobs registered yet)
    routes/              # health, OpenAPI reference, /users
  features/
    auth/                # Better Auth config + routes + middleware
    kaja/
      routes/node/       # connect, heartbeat, disconnect, list, stream, commands
      routes/admin/      # create/list/cancel commands
      services/          # node, command, events, scheduler, command-validator
  emails/                # React Email templates
  lib/geo-client.ts      # external GEO_SERVICE_URL client
  types.ts / types/      # Hono env types, error helpers
migrations/              # raw SQL, applied on first Postgres boot via compose
tests/integration/       # auth, kaja node flow, SSE
```

## Conventions

- **Routes**: `@hono/zod-openapi` + schemas from `@kaja/schema`
- **DB**: raw SQL with parameterized queries via `pg` Pool — never string-interpolate user input
- **Types**: API contracts from `@kaja/schema`; row types stay private in services; map with `#rowTo…` helpers
- **Auth**: `authMiddleware` on all routes; session/bearer via Better Auth
- **Logging**: `@kaja/logger` — `info(message, payload?)`
- **Errors**: helpers in `types/errors.ts` (cast responses for Hono typing)

## Important behaviors

- Node statuses: `idle` | `busy` | `inactive`
- `SchedulerService` marks inactive nodes on heartbeat timeout
- Commands: allowlist + shell-injection rejection in `command-validator.ts`
- SSE: longer `idleTimeout` on the Bun server export (255s)
- OpenAPI UI only when `NODE_ENV === "development"` (`/reference`)
- Rate limit middleware is implemented but **commented out** in `app.ts`

## Env

See `.env.example`.

**Required / common:** `DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `SMTP_HOST`/`SMTP_PORT`, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`, `GEO_SERVICE_URL`, `GEO_SERVICE_API_KEY`, `NODE_ENV`.

**Optional:** `WEB_PUBLIC_URL` (device auth links), `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` (limiters exist in `rate-limit.ts` but are not mounted in `app.ts`).

**Production:** `NODE_ENV=production` (JSON logs, no pino-pretty), quieter log level, strong secret, real SMTP, `CORS_ORIGIN` matching the public web origin.

## Type rules (API layer)

- Import `Node`, `Command`, and request/response types from `@kaja/schema` only
- Keep DB row shapes private inside services; map with `#rowTo…` helpers
- Parameterized SQL only; Better Auth uses the same `pg` Pool (no ORM adapter)

## Boundaries

- Prefer surgical changes; do not reintroduce ORM layers
- Do not enable rate limiting or cron jobs without an explicit request
- Keep migrations additive and lexicographically ordered
