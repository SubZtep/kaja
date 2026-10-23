# @kaja/api

Hono REST API for Kaja: Better Auth, the cloud agent (`/nasi`), abilities, sandboxes, widgets, the cloud Telegram bot, admin config, emails.

## Commands

```bash
# From the monorepo root
bun run --filter @kaja/api dev      # hot reload: src/core/server.ts (widget bundle built lazily on first request, see widgets/CLAUDE.md)
bun run --filter @kaja/api build    # dist/server.js (bun target) + widget bundle into public/widget.js
bun test                            # needs Postgres + RustFS; uses its own <db>_test database
```

Manual migrations: `scripts/db_migration.sh`. `migrate.ts` (stays here, path-coupled to `./migrations` and the Dockerfile build step) runs `scripts/migrations.ts`.

## Layout

```
src/
  app.ts                 # OpenAPIHono app, CORS, route mounts
  core/                  # process infrastructure only (server entry, env, db, report, rate-limit, csrf, cron, ssr-client-ip, i18n, files, geo, lock)
  features/              # one folder per URL mount prefix
    auth/ admin/ config/ config-export/ nasi/ sandbox/ stats/ telegram/ telegram-admin/ widget/ widget-admin/ health/ reference/
  services/              # shared domain logic (ability, marketplace sync, model, sandbox, secret, stats, widget, …)
  emails/                # React Email templates
  types.ts / types/      # Hono env types, error helpers
migrations/              # raw SQL, applied by migrate.ts (and on first Postgres boot via compose)
tests/integration/       # route and service tests against the test database
tests/unit/              # pure helpers
widgets/                 # embeddable browser widget bundle source, own tsconfig (see widgets/CLAUDE.md)
```

Non-obvious features:

- `config/` is `/config`: resolve model (`CONFIG_API_TOKEN`). `config-export/` is `/config/export` (the admin-managed models bundle `kaja config fetch|diff` reads) plus the public defaults: `/config/catalog`, `/config/templates/<file>`, `/config/schemas/<file>.json` (from `@kaja/schema/tombi`); `defaults.ts` is embedded from the repo's `config/` by `services/config-defaults.ts`
- `telegram/` is the cloud bot (not a route); `telegram-admin/` is `/telegram/admin` account linking
- `health/`: `/health` (liveness) and `/health/ready` (database + storage probe; the Docker HEALTHCHECK); `reference/`: the dev OpenAPI UI
- `core/`: `report.ts` is `reportError` (console.error + Sentry), `rate-limit.ts` global + auth + nasi turn limiters (off under `bun test`), `csrf.ts` cookie-session writes must come from `CORS_ORIGIN` (bearer/cookieless pass), `files.ts` the images bucket via `Bun.S3Client` (Hetzner, or the compose RustFS), `lock.ts` `withLock` (in-process per-key serialization, hence one instance)

Adding an endpoint: a route file under the matching `features/<prefix>/` (or a new feature + `app.route(...)`), registered from that feature's `index.ts`, with shared DB/business logic in `services/`.

## Conventions

- **Routes**: `@hono/zod-openapi` + schemas from `@kaja/schema`; API contracts come from there only
- **DB**: raw SQL, parameterized, never string-interpolated user input; no ORM layers. `core/db.ts` has two clients on `DATABASE_URL`, both with `TimeZone=UTC` and `statement_timeout=15000`: `sql` (`Bun.SQL` tagged templates; the nasi store, `features/nasi/store.ts`'s `nasiStore(userId)`, and the image describe writes) and the `pg` `pool` (Better Auth's driver, and the services not moved yet). Row types stay private in services; map with `#rowTo…` helpers
- **Auth**: `authMiddleware` on all routes sets `user` from the bearer token, else the session cookie (no lookup when the request carries neither); routes behind `requireAuthMiddleware` read it with `sessionUser(c)` (401 if missing). No session `cookieCache`: a ban or sign-out must apply at once
- **Logging**: no logger package. A failure the code handles itself (so Sentry's Hono middleware never sees it) goes through `reportError`; a recoverable problem is a `console.warn`; `@kaja/nasi`'s warnings arrive via `setWarnHandler` in `core/server.ts`
- **Errors**: helpers in `types/errors.ts` (cast responses for Hono typing); `knownTurnError` maps `@kaja/nasi`'s typed turn errors (`SessionNotFoundError` 404, `NothingToApproveError` 409, `ModelUnavailableError` 502, `NoModelError` 503). `app.onError` answers anything a route lets escape as `{ error }` JSON (logged only: Sentry already reports thrown errors), and `app.notFound` too
- Prefer surgical changes. Migrations stay lexicographically ordered; until v1.0 a schema change is edited into the file that creates the table (see the root CLAUDE.md)

## Important behaviors

- `/config/*` is fail-closed: it requires a non-empty `CONFIG_API_TOKEN` Bearer match (it leaks provider API keys otherwise)
- OpenAPI UI (`/reference`) only when `NODE_ENV === "development"`
- Rate limits: global, `/auth/*` and `/nasi/turn(/stream)` (the last keyed by user id, not IP); skipped under `bun test` or `RATE_LIMIT_ENABLED=false`
- `/admin/*` requires a signed-in non-banned user; `providers`/`models`/`abilities`/`sandbox` routes also require the Better Auth `admin` role
- `/nasi/turn*` take 16 MB bodies (images), every other route 1 MB

## Marketplace abilities

- `services/marketplace.ts` keeps the `ability` table in step with `marketplace/` in `MARKETPLACE_REPO`@`MARKETPLACE_REF` (default SubZtep/kaja@main): at startup, hourly, and on `POST /admin/abilities/sync`. It asks GitHub for the branch's commit and downloads the tarball (extracted with the image's `tar`) only when it moved. Rows are never deleted: a removed ability gets `removed_at`.
- Each ability folder is stored as one typed row per part the cloud can run: a skill (never one with a `scripts/` folder), its `tool.toml` (skipped when the `baseUrl` isn't public) and its `mcp.toml` (only with a `tools` allowlist; http/sse on a public host, or stdio for the MCP sandbox, see `cloudMcpProblem`). A widget's source is skills only (`{ skillsOnly: true }`): its persona's skills, never tools or MCP.
- No per-user switches: every user has every available ability, every persona in the catalog is in every roster (`personaCatalog`), and the turn's persona picks what it uses. A terminal's turn declares what it runs on the user's computer (`clientTools`, `clientSkills`, `clientPersonas`; `features/nasi/chat.ts`'s `clientOf` → `openNasiFor`'s `client`): its own personas join the catalog (`withOwnPersonas`, same id replaces), the prompt says some tools run on their computer, and paused calls come back as `toolResults`.
- Cloud turns load abilities through `features/nasi/pg-abilities.ts` (an `AbilityStore` over the table) with the server-wide keys, decrypted. Every tool request goes out through a sandbox, never from the API (`features/sandbox/registry.ts`'s `egressFor`, nasi's `egress`; routing rules in `apps/sandbox/CLAUDE.md`). MCP abilities connect only when a persona that lists them is active (nasi's lazy MCP), so **every caller of `openNasiFor` must `close()` the instance after the turn**.
- **Ability keys are server-wide only** (users have none): an admin's key per ability in `service_secret` via `services/secret.ts`, AES-256-GCM with `USER_SECRET_KEY` and the name as associated data, write-only over the API (`/admin/abilities/keys`: list, `PUT` saves and tests it through the official sandbox only, `DELETE`). Every user's turns use them (`AbilityService.serviceKeys`). Without `USER_SECRET_KEY`, key routes answer 503 and abilities that require a key are hidden.
- **Approvals**: a tool that isn't GET pauses the turn (`confirm_tool` step, `needs_approval`); the next turn's `approval` (`approve`, `approve_session` or `decline`) makes Nasi run or skip the call the session saved; `approve_session` lives in `nasi_session.granted_tools`. The cloud Telegram bot answers with inline buttons (`tool:approve|decline|approve_session:<hash of the call id>`), matched against the pressing user's latest session.
- **ask_user options**: the SSE `ask_user` event (and the buffered step) carries the model's optional `options`; the cloud contract (`CLOUD_ASK_USER_INSTRUCTION`) reuses nasi's `ASK_USER_OPTIONS_INSTRUCTION`. The cloud Telegram bot shows them as one button per row (`ask:<hash of the call id>:<index>` callback data, `askButtons`/`parseAskCallback` in `@kaja/shared/telegram`; the event carries the call's `id`): a tap must match the latest session's pending question (`pendingQuestionOptions`), edits the message to `<question> → <option>` and answers with that text; a stale tap says so. The widget (chat mode) shows them as chips under the question (`widgets/src/index.ts`); a click sends the option text.
- **Images** reach clients by plain URL (`core/files.ts`'s `imageUrl`; `images/` is public-read): the SSE `tool_image` carries the image's, `image_described` its description, and `message`/`final` arrive with public URLs in place of their `kaja-image:` links, on every route, the widget's included. The cloud Telegram bot captions a tool image's photo with its alt text, then its description (`editCaption`), and sends a reply's `kaja-image:` links by URL.
- **Image maintenance** (`services/image.ts`): an hourly sweep (`core/cron.ts`, `:15`) describes up to 20 images still without a description, older than 10 minutes and tried fewer than 3 times (`describe_attempts`), rewriting their labels in the saved messages and recording a `describe` model call. Admins have `/admin/images` (list, delete, describe one or all matching) and `/admin/images/orphans` (objects without a row, rows without an object, never-saved sessions' images; removal re-checks and keeps anything under an hour old).
- Both Telegram bots answer in private chats only, reply "still working" to a message while a turn runs, take an album as one turn, and register a `/new` + `/compact` command menu on start (the local bot also has `/abilities`).

## Env

See `.env.example` (generated from `packages/schema/env/api.ts`, the full list). With `NODE_ENV=production` (turns Sentry on) the API also needs `USER_SECRET_KEY`, a `CONFIG_API_TOKEN` other than the `.env.example` placeholder, a strong `BETTER_AUTH_SECRET` other than the placeholder (at least 32 characters: `openssl rand -base64 32`), real SMTP, and `CORS_ORIGIN` matching the public web origin.
