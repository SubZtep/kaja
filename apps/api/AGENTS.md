# @kaja/api

Hono REST API for Kaja: Better Auth, admin config, emails.

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
  core/                  # process infrastructure only
    server.ts            # process entry: cron + export default
    db.ts                # pg Pool
    logger.ts            # traffic logger for hono/logger
    rate-limit.ts        # global + auth limiters (off under bun test)
    cron.ts              # Bun.CronJob shell (intentionally no jobs)
  features/              # one folder per URL mount prefix
    auth/                # Better Auth config + routes + middleware
    admin/               # /admin — mcp-servers, providers, models
    config/              # /config — models/MCP TOML + resolve model (CONFIG_API_TOKEN)
    users/               # /users
    nasi/                # /nasi — hosted agent (per-user sqlite under NASI_DATA_DIR)
    health/              # /health
    reference/           # /reference (dev OpenAPI UI)
  services/              # shared domain logic (mcp-server, model)
  emails/                # React Email templates
  types.ts / types/      # Hono env types, error helpers
migrations/              # raw SQL, applied on first Postgres boot via compose
tests/integration/       # auth
```

### Adding an endpoint

1. Add a route file under the matching `features/<prefix>/` (or create a new feature + `app.route(...)`).
2. Register it from that feature’s `index.ts`.
3. Put shared DB/business logic in `services/`.

## Conventions

- **Routes**: `@hono/zod-openapi` + schemas from `@kaja/schema`
- **DB**: raw SQL with parameterized queries via `pg` Pool — never string-interpolate user input
- **Types**: API contracts from `@kaja/schema`; row types stay private in services; map with `#rowTo…` helpers
- **Auth**: `authMiddleware` on all routes; session/bearer via Better Auth
- **Logging**: `@kaja/logger` — `info(message, payload?)`
- **Errors**: helpers in `types/errors.ts` (cast responses for Hono typing)

## Important behaviors

- `/config/*` is fail-closed: requires non-empty `CONFIG_API_TOKEN` Bearer match (leaks provider API keys otherwise)
- OpenAPI UI only when `NODE_ENV === "development"` (`/reference`)
- Rate limit middleware is mounted (global + `/auth/*`); skipped under `bun test` or `RATE_LIMIT_ENABLED=false`
- `/admin/*` requires a signed-in non-banned user; `mcp-servers`/`providers`/`models` routes require Better Auth `admin` role

## Env

See `.env.example`.

**Required / common:** `DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `SMTP_HOST`/`SMTP_PORT`, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`, `CONFIG_API_TOKEN` (Bearer for `/config/*`; missing/empty denies all config routes), `NODE_ENV`.

**Optional:** `WEB_PUBLIC_URL` (device auth links), `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX`.

**Production:** `NODE_ENV=production` (JSON logs, no pino-pretty), quieter log level, strong secret, real SMTP, `CORS_ORIGIN` matching the public web origin.

## Type rules (API layer)

- Import request/response types from `@kaja/schema` only
- Keep DB row shapes private inside services; map with `#rowTo…` helpers
- Parameterized SQL only; Better Auth uses the same `pg` Pool (no ORM adapter)

## Boundaries

- Prefer surgical changes; do not reintroduce ORM layers
- Keep migrations additive and lexicographically ordered
