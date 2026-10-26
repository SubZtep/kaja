Kaja is a TypeScript monorepo on Bun (no mobile app). It is pre-v1 and not live: breaking changes are fine, the database included (no patch migrations, see `apps/api/CLAUDE.md`).

When you change a feature, update its tests too.

Translations: edit only the en-GB locale files and leave every other language to tooling. Pre-commit `bun sync:locales` gives other languages the new keys with a `[<locale>] lorem ipsum` placeholder; `/translate` fills them in (by hand, or headless from the pre-push hook).

## Workspaces

- **API** (`apps/api`): Hono, Better Auth, PostgreSQL
- **Web** (`apps/web`): TanStack Start: public landing + signed-in portal (admin pages under `/admin`)
- **TUI** (`apps/tui`): Ink; cloud mode talks to the API's `/nasi/*`, `--local` embeds `@kaja/nasi` against the user's own provider
- **Widget**: a cloud principal (secret token, pinned model, generated source) served by the API. The homepage Barkochba board and player are the first programs.
- **Sandbox** (`apps/sandbox`): runs stdio MCP servers and tool egress for cloud turns; dials out to the API, nothing connects in
- **Packages**: `@kaja/nasi` (agent brain), `@kaja/schema`, `@kaja/shared`
- **Image bytes** never go in a database: object storage (API) or files beside the SQLite file (TUI), metadata in `nasi_image`, messages hold `kaja-image:<id>` refs (`packages/nasi/CLAUDE.md`, Images)

## Development

- Infra: `docker compose up -d db mail storage`, then `scripts/storage_init.sh` once per fresh volume (needs the `rc` CLI)
- `bun dev:sandbox` needs Chromium (or `docker compose up -d sandbox`)
- Start the TUI with `bun dev:tui` (loads `apps/tui/.env`)
- Run `bun test` from the repo root: the test preloads (and the API's test database switch) live in the root `bunfig.toml`
- `bun tailwind:fix` needs a clean tree and also bumps Tailwind; CI fails if it would change `apps/web/src`

## Conventions

- Comments: one line, no wrapping. `/** ... */` (TSDoc) on exported functions/values, `// ...` for internal notes
- Import packages by name: `@kaja/nasi` exports its root (and `./client`); `@kaja/schema` and `@kaja/shared` only subpaths (e.g. `@kaja/schema/api`)
- TOML: `tombi format && tombi lint`, using the machine's `tombi` (not a dependency)
- File names: shell scripts are snake_case (Google style), TS files kebab-case (lint)

## Generated files and hooks

- Lefthook runs lint, fmt and typecheck on commit, lint, typecheck and the headless `/translate` on push (plus `bun test` when pushing `main`). Let them catch issues; run them yourself only when you need feedback sooner
- Model defaults live nowhere in the repo: the TUI wizard reads [models.dev](https://models.dev) directly (`apps/tui/lib/models/modelsdev.ts`, cached with its ETag) and `kaja config fetch` refreshes models.toml from it. Offline, the wizard asks for every detail of the user's own provider
- Env vars: edit `packages/schema/env/{api,web,sandbox,tui}.ts`, run `bun generate:env` and `bun generate:env-types`; the api/web/sandbox `.env.example` are generated (tui's is hand-written)
- `bun check:env` fails CI and pre-push on drift (pre-commit regenerates instead)
