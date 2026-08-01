# @kaja/schema

Single source of truth for **API contract** Zod schemas and related TypeScript types shared by API, web, SDK, and CLI device auth.

## Layout

```
index.ts    # re-exports + KAJA_CLI_CLIENT_ID
auth.ts     # auth-related payloads if any
geo.ts      # GeoLocation schema
node.ts     # node, heartbeat, command request/response schemas
```

## Conventions

- Zod **v4** only
- Export both schemas and inferred types (`z.infer<typeof …>`) consistently with existing files
- Date fields that cross JSON boundaries: prefer `z.coerce.date()`
- UUIDs: `z.uuidv7()` where the API uses UUIDv7
- Keep this package free of runtime I/O, React, and Hono — pure schemas only

## Type architecture (repo-wide)

| Layer | Where |
|-------|--------|
| Public API types (`Node`, `Command`, …) | **here** (`@kaja/schema`) |
| DB rows / query shapes | private inside `@kaja/api` services |
| CLI-local config, personas, sessions | `apps/cli/schemas/` |

Consumers (`api`, `sdk`, `web`) import contracts from this package only — never redefine the same payloads elsewhere.

## Consumers

- `@kaja/api` — request validation / OpenAPI
- `@kaja/sdk` — response parsing
- `@kaja/web` — form and type alignment
- CLI device/client id constant: `KAJA_CLI_CLIENT_ID = "kaja-cli"`

## Boundaries

- Do **not** put DB row types here (those stay private in API services)
- Do **not** put CLI-local config/persona schemas here (those live under `apps/cli/schemas/`)
- Changing a schema is a breaking change for all consumers — update API + SDK + tests together
