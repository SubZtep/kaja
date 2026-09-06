# @kaja/schema

Single source of truth for Zod schemas and related TypeScript types across the monorepo, split into role-based subpaths so unrelated concerns (e.g. two different things both called "model") never collide on import.

## Layout

```
api/         # API contracts: shared by API, web, and CLI device auth
  index.ts     # re-exports + KAJA_CLI_CLIENT_ID
  auth.ts      # auth-related payloads
  mcp-server.ts  # MCP server admin CRUD schemas
  model.ts       # provider/model admin CRUD schemas
  persona-toml.ts  # persona admin CRUD schemas
  widget-key.ts    # widget key admin CRUD schemas
config/      # CLI on-disk config files the user hand-edits (settings.toml, models.toml, mcp.toml, services.toml, secrets.toml)
store/       # SQLite-backed runtime state (sessions, memory notes) used by @kaja/nasi
cli/         # Personas, datasets
nasi/        # Nasi HTTP turn contract (request/response, steps, session meta)
env/         # Per-app env var schemas (ApiEnvSchema, WebEnvSchema, CliEnvSchema) + shared parsing helpers (parseEnv, bool/url/positiveInt/trimmed)
  index.ts     # re-exports api/web/cli/logger/helpers
  api.ts       # ApiEnvSchema — LoggerEnvSchema.extend() + every other var apps/api reads
  web.ts       # WebEnvSchema — LoggerEnvSchema.extend() + every other var apps/web reads
  cli.ts       # CliEnvSchema — LoggerEnvSchema.extend() + KAJA_API_URL (locale vars and a hyperlink-support workaround stay plain process.env reads)
  logger.ts    # LoggerEnvSchema — @kaja/logger's own contract (KAJA_APP_NAME, KAJA_LOG_LEVEL, KAJA_LOG_FILE, AXIOM_DATASET, AXIOM_TOKEN, NODE_ENV); merged into api/web/cli so it's typed/validated everywhere even though @kaja/logger itself reads these raw via process.env (it can't depend on @kaja/schema)
  helpers.ts   # trimmed/bool/positiveInt/url field helpers, parseEnv(schema, source)
tombi/       # TOML<->JSON schema generator, wired into root `generate:schemas`
```

Each directory is its own subpath export (`@kaja/schema/api`, `@kaja/schema/config`, `@kaja/schema/store`, `@kaja/schema/cli`, `@kaja/schema/nasi`, `@kaja/schema/env`) — there is no bare `@kaja/schema` import. Pick the subpath by what the schema describes, not by which app happens to consume it.

## Conventions

- Zod **v4** only
- Export both schemas and inferred types (`z.infer<typeof …>`) consistently with existing files
- Date fields that cross JSON boundaries: prefer `z.coerce.date()`
- UUIDs: `z.uuidv7()` where the API uses UUIDv7
- Keep this package free of runtime I/O, React, and Hono — pure schemas only
- Same-named-but-unrelated types across subpaths (e.g. `api`'s `ResolvedModel` vs `config`'s `CliResolvedModel`) are fine — that's exactly what the subpath split is for. Only rename when a name collision would otherwise be genuinely confusing to a reader who imports from two subpaths in the same file.

## Consumers

- `@kaja/api` — request validation / OpenAPI (`@kaja/schema/api`)
- `@kaja/web` — form and type alignment (`@kaja/schema/api`)
- `@kaja/cli` — local config/store/domain schemas (`@kaja/schema/config`, `/store`, `/cli`)
- CLI device/client id constant: `KAJA_CLI_CLIENT_ID = "kaja-cli"` (in `api/index.ts`)

## Boundaries

- Do **not** put DB row types here (those stay private in API services)
- Changing a schema is a breaking change for all consumers of that subpath — update every consumer + tests together
