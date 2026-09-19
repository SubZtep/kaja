# @kaja/api

Hono REST API for Kaja: Better Auth, admin config, emails.

## Commands

```bash
# From monorepo root
bun run --filter @kaja/api dev      # hot reload: src/core/server.ts (widget bundle built lazily on first request, see widgets/AGENTS.md)
bun run --filter @kaja/api build    # dist/server.js (bun target) + widget bundle into public/widget.js
bun run --filter @kaja/api start

# Tests live at monorepo root (needs Postgres + env)
bun run test
```

Local secrets helper: `../../scripts/create_local_secrets.sh`  
Manual migrations: `../../scripts/db_migration.sh`  
DB migration builder for Docker/Disco (stays here — path-coupled to `./migrations` and the Dockerfile build step): `migrate.ts`

## Layout

```
src/
  app.ts                 # OpenAPIHono app, CORS, route mounts
  core/                  # process infrastructure only
    server.ts            # process entry: cron, startup marketplace sync, export default
    db.ts                # pg Pool
    logger.ts            # traffic logger for hono/logger
    rate-limit.ts        # global + auth + nasi turn limiters (off under bun test)
    cron.ts              # Bun.cron jobs: hourly marketplace sync
  features/              # one folder per URL mount prefix
    auth/                # Better Auth config + routes + middleware
    admin/               # /admin — mcp-servers, providers, models, personas, packages/sync
    config/              # /config — models/MCP TOML + resolve model (CONFIG_API_TOKEN)
    users/               # /users
    nasi/                # /nasi — cloud agent (sessions/memory/datasets in Postgres)
    packages/            # /packages — public skill catalog; /packages/me — the user's enabled skills
    health/              # /health
    reference/           # /reference (dev OpenAPI UI)
  services/              # shared domain logic (mcp-server, model, package, marketplace sync, …)
  emails/                # React Email templates
  types.ts / types/      # Hono env types, error helpers
migrations/              # raw SQL, applied on first Postgres boot via compose
tests/integration/       # auth
widgets/                 # embeddable browser widget bundle source, own tsconfig (see widgets/AGENTS.md)
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
- Rate limit middleware is mounted (global + `/auth/*` + `/nasi/turn(/stream)`, the last keyed by user id not IP); skipped under `bun test` or `RATE_LIMIT_ENABLED=false`
- `/admin/*` requires a signed-in non-banned user; `mcp-servers`/`providers`/`models` routes require Better Auth `admin` role

## Marketplace skills

`services/marketplace.ts` keeps the `package` table in step with `marketplace/` in `MARKETPLACE_REPO`@`MARKETPLACE_REF` (default SubZtep/kaja@main): at startup, hourly, and on `POST /admin/packages/sync`. It asks GitHub for the branch's commit and only downloads the tarball (extracted with the image's `tar`) when it moved. Rows are never deleted — a package that leaves the marketplace gets `removed_at`, keeping users' selections. The cloud offers skills only, and never ones with a `scripts/` folder. Cloud turns load the user's enabled skills through `features/nasi/pg-packages.ts` (a `PackageStore` over the table); a widget key uses its own `config.skills` instead.

## Env

See `.env.example`.

**Required / common:** `DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `SMTP_HOST`/`SMTP_PORT`, `KAJA_APP_NAME`, `KAJA_LOG_LEVEL`, `CONFIG_API_TOKEN` (Bearer for `/config/*`; missing/empty denies all config routes), `NODE_ENV`.

**Optional:** `WEB_PUBLIC_URL` (device auth links), `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX`, `NASI_TURN_RATE_LIMIT_WINDOW_MS` / `NASI_TURN_RATE_LIMIT_MAX`.

**Production:** `NODE_ENV=production` (JSON logs, no pino-pretty), quieter log level, strong secret, real SMTP, `CORS_ORIGIN` matching the public web origin.

## Type rules (API layer)

- Import request/response types from `@kaja/schema` only
- Keep DB row shapes private inside services; map with `#rowTo…` helpers
- Parameterized SQL only; Better Auth uses the same `pg` Pool (no ORM adapter)

## Boundaries

- Prefer surgical changes; do not reintroduce ORM layers
- Keep migrations additive and lexicographically ordered
