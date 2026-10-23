This file provides guidance to LLM agents when working with code in this repository.

The project is not live yet, so feel free to adjust any breaking changes.

When you modify a feature check its test (if any) for possible required update too.

Translations: edit only the en-GB locale files; never read or edit other languages. Pre-commit runs `bun sync:locales` (`scripts/locales.ts`), which gives every other language the same keys and a `[<locale>] lorem ipsum` placeholder for new or changed English; `/translate` (`.claude/skills/translate`) fills them in, run by hand or headless by the pre-push hook.

## Project Overview

Kaja is a TypeScript monorepo built with Bun. There is no mobile app.

- **API** (`apps/api`): Hono REST API with Better Auth, PostgreSQL
- **Web** (`apps/web`): TanStack Start frontend: public landing + admin portal
- **TUI** (`apps/tui`): Ink TUI; talks to the cloud API (`/nasi/*`) by default, `--local` embeds `@kaja/nasi` and runs the agent loop against your own provider
- **Widget** (`apps/api/widgets`): embeddable browser chat bundle, built with the API and served at `/widget/<widget-key>.js` (the key resolves the persona/mode server-side)
- **Sandbox** (`apps/sandbox`): runs stdio MCP servers for cloud turns (`subztep/kaja-sandbox`); anyone can run one. It dials the API's WebSocket (`/sandbox/connect`), so nothing connects in
- **Packages**: `@kaja/schema`, `@kaja/shared`, `@kaja/nasi` (agent brain)
- **Image bytes** are never in a database. Each image is normalised and stored the moment it arrives (`@kaja/nasi`'s `NasiStore.images(sessionId)` over nasi's `ObjectStore`: the API uses Bun's S3 client on Hetzner Object Storage at `images/<userId>/<sessionId>/`, the TUI plain files in `files/` beside the SQLite file). Only the normalised copy is kept; its metadata (type, size, description, and its source's URL, alt, title or file name) is a row: Postgres `nasi_image`, the TUI's SQLite `images` (no session FK, since a new session's images arrive before its first save; `clear()` removes them). Messages hold `kaja-image:<id>` refs, even in memory; only a model request gets the bytes. `images/` is public-read (set by hand on Hetzner; `scripts/storage_init.sh` sets it on the dev RustFS), so cloud clients and Telegram get plain URLs

## Key File Locations

- Docker Compose: `compose.yaml`; lockfile: `bun.lock`; root TS config: `tsconfig.json`
- Env examples: `apps/{api,web}/.env.example`
- DB migrations: `apps/api/migrations/*.sql`, applied by `apps/api/scripts/migrations.ts` (`applyMigrations`), used by `apps/api/migrate.ts` (deploy, CI, `scripts/db_migration.sh` locally; then the config seed) and the test database build
- `.env.example` generator: `scripts/env.ts` (`bun generate:env` / `bun check:env`); `env.d.ts` generator: `scripts/env-types.ts`
- Model defaults: `config/catalog.toml` (schema `@kaja/schema/config` `CatalogFileSchema`, loaded by `apps/tui/lib/models/catalog.ts`) → `scripts/models.ts` (`bun generate:models` / `bun check:models`) writes `config/models.*.toml`
- Test env preload: `apps/api/tests/load-test-env.ts` (wired via `bunfig.toml` `[test].preload`; also switches to the test database)
- Docs / GitHub Pages: `docs/` (user-facing site; the config templates live in `config/`)

## Development Commands

```bash
# PostgreSQL + MailDev + RustFS object storage (API/web optional via compose)
docker compose up -d db mail storage
scripts/storage_init.sh   # its bucket and public images/ rule, once per fresh volume (needs the `rc` CLI)

bun dev                # API + web + widget (hot reload)
bun dev:sandbox        # MCP sandbox for cloud stdio MCP abilities (needs Chromium; or `docker compose up -d sandbox`)
bun dev:tui            # CLI (entry is apps/tui/cli.ts); `--filter @kaja/tui start` doesn't pass the TTY through (Ink: "Raw mode is not supported")

bun lint
bun fmt
tombi format && tombi lint   # TOML (Tombi, run directly)
bun tailwind:fix       # rewrite apps/web classes to their canonical form (@tailwindcss/upgrade; needs a clean tree, also bumps Tailwind); CI fails if src/ would change
bun typecheck          # apps/*, packages/*, .claude/skills and root scripts/ (with their tests/); incremental (gitignored .tsbuildinfo); fails on first error
bun test               # every workspace's tests; run from the repo root (API integration tests need Postgres + RustFS)
```

Per workspace: `bun run --filter @kaja/<name> dev|build|test`.

## Architecture

### Authentication

- Better Auth, passwordless: emailed 6-digit sign-in codes (`emailOTP`; sign-up is a code sign-in with the page's `consent`), optional Google sign-in via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, email change, admin roles, device authorization
- Device flow for API-connected clients: CLI client id `KAJA_TUI_CLIENT_ID` (`"kaja-tui"`, from `@kaja/schema`), approval UI at web `/device`
- Session cookies prefixed with `kaja`

### Where things live

- **API** (`apps/api/src/`): `core/server.ts` entry, `app.ts` middleware and route mounts, `features/*` one folder per URL mount, `services/` shared logic. Raw SQL + private row→API mappers; UUIDv7 PKs. The API runs as one instance (`core/lock.ts` serializes in-process; sandbox sockets live in memory). Details: `apps/api/CLAUDE.md`
- **Web** (`apps/web/src/`): TanStack Router file routes, `_public` (landing, auth, device) and `_admin` (dashboard, agent, profile, admin-only `/admin/*`). `routeTree.gen.ts` is generated and ignored by `bun fmt`. Details: `apps/web/CLAUDE.md`
- **Sandbox**: details in `apps/sandbox/CLAUDE.md`
- **CLI** (`apps/tui/`): entry `cli.ts`; local host for `@kaja/nasi` plus the Telegram bot and optional STT/TTS, and the cloud client for `/nasi/*`. Config templates import from monorepo-root `config/`. Details: `apps/tui/CLAUDE.md`

### Packages

| Package        | Role                                                                                   |
| -------------- | -------------------------------------------------------------------------------------- |
| `@kaja/schema` | Zod API contracts + `KAJA_TUI_CLIENT_ID` (single source of truth for API types)        |
| `@kaja/shared` | Pure utils by subpath (`/date`, `/text`, `/ui`, `/net`, `/id`, `/locale`, `/telegram`) |
| `@kaja/nasi`   | Agent loop, store interface, tools. CLI uses sqlite; API uses Postgres.                |

### Type architecture

- **All Zod schemas live in `@kaja/schema`**, in role-based subpaths (`api`, `config`, `store`, `abilities`, `cli`, `nasi`, `env`, `tombi`); no bare `@kaja/schema` import and no app keeps local schema files. Pick the subpath by what the schema describes; layout in `packages/schema/CLAUDE.md`
- **DB row types** are private to API services; map with private `#rowTo…` helpers
- **Dates over JSON**: `z.coerce.date()` in schemas

### Database migrations

Files in `apps/api/migrations/` apply in lexicographic order. Each file only creates; there are no patch migrations, so a schema change until v1.0 is edited into the file that creates the table (and existing databases are recreated).

`migrate.ts` records each applied file and its checksum in `schema_migrations` and applies only new or (before v1.0) edited files, each in its own transaction; from v1.0 an edited file is refused and a change needs a new file. Compose also runs the raw files on first Postgres init (`docker-entrypoint-initdb.d`); an existing `pgdata` volume catches up with `scripts/db_migration.sh`.

## Code Style

- `bun lint` and `bun fmt`, both configured in the root `bunfig.toml` (`[lint]`, `[fmt]`): double quotes, no semicolons, no trailing commas; type-aware lint rules; suppress a rule with `// oxlint-disable-next-line <rule> -- why`
- Tombi isn't a dependency: the TOML scripts, hooks and `scripts/models.ts` run the machine's `tombi` directly (CI installs it with `tombi-toml/setup-tombi`)
- `bun run generate:schemas` regenerates JSON from `packages/schema/tombi`
- TypeScript: ESNext, bundler resolution, strict, `react-jsx`; workspace deps via `workspace:*`. Import packages by package name; `@kaja/nasi` exports its root `index.ts` (and `./client`), `@kaja/schema` and `@kaja/shared` only subpaths (e.g. `@kaja/schema/api`)
- Prefer surgical diffs; do not drive-by refactor
- Start a function name with `use` only for a React hook (the hooks lint rule flags any other); name the rest `register…`, `create…` and so on
- Comments: single line, no wrapping. `/** ... */` (TSDoc) for exported functions/values; `// ...` for internal notes

## Notes

- Git hooks (lefthook) run `bun lint --fix --staged`, `bun fmt --staged` and typecheck on commit, and lint and typecheck on push (plus `bun test` when pushing `main`; then `scripts/translate_push.sh` runs `/translate` headless on leftover placeholders, commits and pushes the translations, and stops the original push). Don't run these proactively; commit/push will catch issues. Run them manually only when you need feedback before that point
- Model defaults: edit `config/catalog.toml`, run `bun generate:models`, never edit `config/models.*.toml` by hand; pre-commit regenerates them and `bun check:models` (CI, and the catalog test) fails on drift. `models.default.toml` is what `kaja config fetch --offline` writes and what the API seed loads (task defaults of hosted providers only). Provider order in the catalog decides a contested task's default, in the wizard and the examples (an example can override it with `pick`). The API serves the catalog (`GET /config/catalog`, versioned by `CATALOG_VERSION`) and the templates (`GET /config/templates/<file>`) publicly, embedded from `config/` at build time; the setup wizard prefers the API's catalog and falls back to the bundled one, so a catalog change takes effect on an API deploy
- Env vars: edit `packages/schema/env/{api,web,sandbox,tui}.ts`, run `bun generate:env` (also `bun generate:env-types` for each workspace's `env.d.ts`), never edit the api/web/sandbox `.env.example` by hand (tui's is hand-written); `bun check:env` (pre-commit and CI) fails on drift

## Testing & CI

- `bun test` preloads `apps/api/.env.example` then `apps/api/.env` via `apps/api/tests/load-test-env.ts`
- API integration tests need a running Postgres matching `DATABASE_URL`, but run against their own database: the preload (`apps/api/tests/test-database.ts`) points them at `<dev database>_test` (or `TEST_DATABASE_URL`) and rebuilds it from `apps/api/migrations` whenever those files change, so a running `bun dev` (its marketplace sync on every hot restart) can't race them
- CI (`.github/workflows/ci.yaml`): lint (`bun lint` on Bun canary, which has the linter, after generating Paraglide since type-aware lint needs it; `bun fmt --check`; Tombi; canonical Tailwind classes), then typecheck, the Docker builds (api with widget, sandbox, web), tests with Postgres + RustFS (after a deploy-style migrate and seed), locale and env/model drift checks, and a TUI compile. A separate workflow builds the CLI
- Docker Scout (`scout.yaml`) comments the sandbox image's CVE changes on PRs touching `apps/sandbox` or `packages`; see `apps/sandbox/CLAUDE.md`

## Agent Guidelines

- Per-workspace details live in each package's `CLAUDE.md` (loaded when working in that folder)
- Do not commit secrets; use `.env` (gitignored) over examples
- Ask before git mutations, large refactors, or new features
