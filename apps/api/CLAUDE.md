# @kaja/api

Hono REST API: Better Auth, the cloud agent (`/nasi`), abilities, sandboxes, widgets, the cloud Telegram bot, admin config, emails.

## Migrations

Files in `migrations/` apply in lexicographic order and only create. Until v1.0 a schema change is edited into the file that creates the table, and existing databases are recreated.

- `migrate.ts` stays in this folder (path-coupled to `./migrations` and the Dockerfile): it runs `applyMigrations` (`scripts/migrations.ts`); deploy, CI, `scripts/db_migration.sh` and the test database use it
- `schema_migrations` records each file's checksum: new or (before v1.0) edited files apply, each in its own transaction; from v1.0 an edited file is refused
- Compose runs the raw files on first Postgres init; an existing `pgdata` volume catches up with `scripts/db_migration.sh`

## Tests

Integration tests need Postgres at `DATABASE_URL` but use `<dev database>_test` (or `TEST_DATABASE_URL`), rebuilt from `migrations/` whenever they change, so a running `bun dev` can't race them.

## Conventions

- **DB**: raw parameterized SQL, no ORM, UUIDv7 keys. `core/db.ts` has two clients: `sql` (`Bun.SQL`, every query of ours; services take it as `SQL`) and the `pg` `pool`, Better Auth's driver only (the one file importing `pg`; Better Auth never gets `sql`)
  - Dynamic SQL is nested `sql` fragments and `sql(identifier)`, never concatenated text; `sql.unsafe` runs only migration files
  - A write's success is `result.affectedRows`; an advisory lock needs `sql.reserve()` (it belongs to one connection)
  - Row types stay private in services, mapped by `#rowTo…` helpers
- **Auth**: passwordless (emailed 6-digit codes; sign-up is a code sign-in with `consent`), optional Google, device authorization for the TUI (approval UI at web `/device`). `authMiddleware` sets `user` from the bearer token, else the session cookie; routes behind `requireAuthMiddleware` read it with `sessionUser(c)`. No session `cookieCache`: a ban or sign-out must apply at once
- **Logging**: no logger package. An error the code handles itself (so Sentry's middleware never sees it) goes through `reportError`; a recoverable problem is `console.warn`
- **Errors**: `knownTurnError` maps nasi's typed turn errors to statuses; `app.onError` answers anything else as `{ error }` JSON
- **One instance**: `core/lock.ts`'s `withLock` is in-process and sandbox sockets live in memory, so the API runs as a single instance

## Routes

- `/config/*` is fail-closed (it would leak provider keys): it needs a non-empty `CONFIG_API_TOKEN` match. Public exceptions: `/config/schemas/<file>.json` (generated from `@kaja/schema`) and `/config/sounds`
- Rate limits: global, `/auth/*` and `/nasi/turn(/stream)` (by user id); off under `bun test` or `RATE_LIMIT_ENABLED=false`
- CSRF: cookie-session writes must come from `CORS_ORIGIN`
- `/admin/*` needs a signed-in non-banned user; `providers`/`models`/`abilities`/`sandbox` also the `admin` role
- `/nasi/turn*` take 16 MB bodies (images), everything else 1 MB
- Both Telegram bots (here and the TUI's local one, plumbing in `@kaja/shared/telegram`) behave alike: private chats only, "still working" during a turn, an album is one turn, a `/new` + `/compact` menu

## Abilities

- `services/marketplace.ts` syncs the `ability` table from `marketplace/` in `MARKETPLACE_REPO`@`MARKETPLACE_REF` (startup, hourly, `POST /admin/abilities/sync`). Rows are never deleted; a removed ability gets `removed_at`
- Each ability is stored as one row per part the cloud can run: a skill (never one with `scripts/`), `tool.toml` (public `baseUrl` only), `mcp.toml` (needs a `tools` allowlist; see `cloudMcpProblem`). Widgets do not load abilities; they call `POST /ai/chat`
- No per-user switches: everyone has every ability and persona, and the turn's persona picks. A terminal's turn declares what runs on the user's computer (`clientTools`, `clientSkills`, `clientPersonas` → `openNasiFor`'s `client`)
- Every tool request goes out through a sandbox, never from the API (`features/sandbox/registry.ts`'s `egressFor`)
- **Every caller of `openNasiFor` must `close()` the instance after the turn** (lazy MCP connections)
- Ability keys are server-wide only: an admin's key per ability in `service_secret` (`services/secret.ts`, AES-256-GCM with `USER_SECRET_KEY`), write-only over `/admin/abilities/keys`. Without `USER_SECRET_KEY`, key routes answer 503 and keyed abilities are hidden
- Approvals (flow in `packages/nasi/CLAUDE.md`): `approve_session` grants live in `nasi_session.granted_tools`. Telegram buttons carry a hash of the call id (`tool:…`, `ask:…:<index>`), matched against the pressing user's latest session; a stale tap says so

## Images

- Stored at `images/<userId>/<sessionId>/`; `nasi_image` has no session FK because a new session's images arrive before its first save
- Clients get plain URLs (`core/files.ts`'s `imageUrl`): `images/` is public-read (set by hand on Hetzner, by `scripts/storage_init.sh` locally), and every route swaps `kaja-image:` links for public URLs
- `services/image.ts`: an hourly sweep describes images still lacking a description (3 tries, `describe_attempts`); `/admin/images/orphans` cleanup keeps anything under an hour old
