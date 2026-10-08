# @kaja/api

Hono REST API for Kaja: Better Auth, the cloud agent (`/nasi`), abilities, sandboxes, widgets, the cloud Telegram bot, admin config, emails.

## Commands

```bash
# From monorepo root
bun run --filter @kaja/api dev      # hot reload: src/core/server.ts (widget bundle built lazily on first request, see widgets/CLAUDE.md)
bun run --filter @kaja/api build    # dist/server.js (bun target) + widget bundle into public/widget.js
bun run --filter @kaja/api start

# Tests run from the monorepo root (needs Postgres + RustFS; uses its own <db>_test database)
bun test
```

Local secrets helper: `../../scripts/create_local_secrets.sh`  
Manual migrations: `../../scripts/db_migration.sh`  
DB migration builder for Docker/Disco (stays here — path-coupled to `./migrations` and the Dockerfile build step): `migrate.ts`, running `scripts/migrations.ts` (`schema_migrations` tracking, one transaction per file)

## Layout

```
src/
  app.ts                 # OpenAPIHono app, CORS, route mounts
  core/                  # process infrastructure only
    server.ts            # process entry: cron, startup marketplace sync, export default
    env.ts               # parsed ApiEnvSchema
    db.ts                # pg Pool
    report.ts            # reportError: console.error + Sentry for failures the code handles itself
    rate-limit.ts        # global + auth + nasi turn limiters (off under bun test)
    csrf.ts              # cookie-session writes must come from CORS_ORIGIN (bearer/cookieless pass)
    cron.ts              # Bun.cron jobs: hourly marketplace sync
    ssr-client-ip.ts     # trusts the web SSR's visitor IP via SSR_SECRET
    i18n.ts              # per-call translator over locales/*.toml (emails, Telegram bot)
    files.ts             # files-sdk object storage for images (Hetzner, or the compose RustFS)
    geo.ts               # IP geolocation (sandboxes)
    lock.ts              # withLock: in-process per-key serialization (single instance)
  features/              # one folder per URL mount prefix
    auth/                # Better Auth config + routes + middleware
    admin/               # /admin — providers, models, abilities/sync, sandbox
    config/              # /config — resolve model (CONFIG_API_TOKEN)
    config-export/       # /config/export — the admin-managed models bundle `kaja config fetch|diff` reads
    nasi/                # /nasi — cloud agent (sessions/memory/datasets in Postgres)
    abilities/            # /abilities/me — the user's write-only ability keys (every ability is on for everyone)
    sandbox/             # /sandbox — sandboxes' WebSocket (/sandbox/connect), routing, users' sandbox keys and settings
    stats/               # /stats — a user's own activity numbers
    telegram/            # the cloud Telegram bot (not a route)
    telegram-admin/      # /telegram/admin — Telegram account linking
    widget/              # /widget — the embed script and POST /widget/turn
    widget-admin/        # /widget/admin — widget key CRUD
    health/              # /health (liveness), /health/ready (database + storage probe; the Docker HEALTHCHECK)
    reference/           # /reference (dev OpenAPI UI)
  services/              # shared domain logic (ability, marketplace sync, model, sandbox, secret, stats, widget, …)
  emails/                # React Email templates
  types.ts / types/      # Hono env types, error helpers
migrations/              # raw SQL, applied by migrate.ts (and on first Postgres boot via compose)
tests/integration/       # route and service tests against the test database
tests/unit/              # pure helpers (env, i18n, lock, client IP, …)
widgets/                 # embeddable browser widget bundle source, own tsconfig (see widgets/CLAUDE.md)
```

### Adding an endpoint

1. Add a route file under the matching `features/<prefix>/` (or create a new feature + `app.route(...)`).
2. Register it from that feature’s `index.ts`.
3. Put shared DB/business logic in `services/`.

## Conventions

- **Routes**: `@hono/zod-openapi` + schemas from `@kaja/schema`
- **DB**: raw SQL with parameterized queries via `pg` Pool — never string-interpolate user input
- **Types**: API contracts from `@kaja/schema`; row types stay private in services; map with `#rowTo…` helpers
- **Auth**: `authMiddleware` on all routes sets `user` from the bearer token, else the session cookie (no lookup when the request carries neither); routes behind `requireAuthMiddleware` read it with `sessionUser(c)` (401 if missing). No session `cookieCache`: a ban or sign-out must apply at once
- **Logging**: no logger package. A failure the code handles itself (so Sentry's Hono middleware never sees it) goes through `core/report.ts`'s `reportError`; a recoverable problem is a `console.warn`; `@kaja/nasi`'s warnings arrive via `setWarnHandler` in `core/server.ts`
- **Errors**: helpers in `types/errors.ts` (cast responses for Hono typing); `knownTurnError` maps `@kaja/nasi`'s typed turn errors (`SessionNotFoundError` 404, `NothingToApproveError` 409, `ModelUnavailableError` 502, `NoModelError` 503). `app.onError` answers anything a route lets escape as `{ error }` JSON (logged only: the Sentry middleware already reports thrown errors), and `app.notFound` too

## Important behaviors

- `/config/*` is fail-closed: requires non-empty `CONFIG_API_TOKEN` Bearer match (leaks provider API keys otherwise)
- OpenAPI UI only when `NODE_ENV === "development"` (`/reference`)
- Rate limit middleware is mounted (global + `/auth/*` + `/nasi/turn(/stream)`, the last keyed by user id not IP); skipped under `bun test` or `RATE_LIMIT_ENABLED=false`
- `/admin/*` requires a signed-in non-banned user; `providers`/`models`/`abilities`/`sandbox` routes require Better Auth `admin` role

## Marketplace abilities

`services/marketplace.ts` keeps the `ability` table in step with the marketplace sources in `MARKETPLACE_SOURCES` (default `kajaio/marketplace`; a private one such as `kajaio/darkmarket` needs `MARKETPLACE_GITHUB_TOKEN`), merged in order by nasi's `sources.ts`, later ones winning: at startup, hourly, and on `POST /admin/abilities/sync`. It asks GitHub for each source's commit and only downloads the tarballs (`Bun.Archive`, no `tar`) when one moved; a folder source (development) is re-read every time. The recorded commit is each source's `owner/repo#ref@sha`, comma-separated. Rows are never deleted — an ability that leaves the marketplace gets `removed_at`. Each ability folder (`abilities/<name>/`) is stored as one typed row per part the cloud can run: a skill (never one with a `scripts/` folder), its `tool.toml` (skipped when the `baseUrl` isn't public) and its `mcp.toml` (only with a `tools` allowlist, http/sse on a public host or keyless stdio for the MCP sandbox — `cloudMcpProblem`). There are no per-user switches: every user has every available ability, every persona in the catalog is in every roster (`personaCatalog`), and the turn's persona picks what it uses. Cloud turns load all of it through `features/nasi/pg-abilities.ts` (an `AbilityStore` over the table) with the user's decrypted keys and `WEB_PROXY` (else direct, private hosts refused); MCP abilities connect only when a persona that lists them is active (nasi's lazy MCP), so every caller of `openNasiFor` must `close()` the instance after the turn. A widget's source is skills only (`{ skillsOnly: true }`): its persona's skills, never tools or MCP.

Ability keys live in `user_secret` via `services/secret.ts`: AES-256-GCM with `USER_SECRET_KEY`, the user id + name as associated data, write-only over the API (`GET /abilities/me` lists the keyed abilities some persona uses, `PUT /abilities/me/keys/{name}` saves and tests one: an HTTP tool's `check`, or connecting to the MCP server; one key per ability). Without `USER_SECRET_KEY`, key routes answer 503 and abilities that require a key are hidden. `ABILITY_KEYS` (temporary, `name=key,...`) gives an ability a server-wide key every user shares; its key need becomes optional and a user's own key wins (`AbilityService.#keyNeed`, `keysForUser`). A tool that isn't GET pauses the turn (`confirm_tool` step, `needs_approval`); the next turn's `approval` (`approve`, `approve_session` or `decline`) makes Nasi run or skip the call the session saved; `approve_session` lives in `nasi_session.granted_tools`. The cloud Telegram bot answers it with inline buttons (`tool:approve|decline|approve_session:<hash of the call id>`), matched against the pressing user's latest session. Both bots register a `/new` + `/compact` command menu on start (the local bot also has `/abilities`).

## Env

See `.env.example`.

**Required / common:** `DATABASE_URL`, `CORS_ORIGIN`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (at least 32 characters; generate with `openssl rand -base64 32`), `SMTP_HOST`/`SMTP_PORT`, `CONFIG_API_TOKEN` (Bearer for `/config/*`; missing/empty denies all config routes), `NODE_ENV`. With `NODE_ENV=production` the API also needs `USER_SECRET_KEY` and a `CONFIG_API_TOKEN` other than the `.env.example` placeholder.

**Optional:** `WEB_PUBLIC_URL` (device auth links), `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX`, `NASI_TURN_RATE_LIMIT_WINDOW_MS` / `NASI_TURN_RATE_LIMIT_MAX`, the widget limits, Google sign-in, Turnstile, `STORAGE_*`, `TELEGRAM_BOT_TOKEN`, `SANDBOX_SYSTEM_KEY`, `GEO_API_*`, `MARKETPLACE_*`, `WEB_PROXY`, `ABILITY_KEYS`. The full list is `packages/schema/env/api.ts`.

**Production:** `NODE_ENV=production` (turns Sentry on), strong secret, real SMTP, `CORS_ORIGIN` matching the public web origin.

## Type rules (API layer)

- Import request/response types from `@kaja/schema` only
- Keep DB row shapes private inside services; map with `#rowTo…` helpers
- Parameterized SQL only; Better Auth uses the same `pg` Pool (no ORM adapter)

## Boundaries

- Prefer surgical changes; do not reintroduce ORM layers
- Migrations stay lexicographically ordered; until v1.0 a schema change is edited into the file that creates the table (no patch migrations, see the root CLAUDE.md)
