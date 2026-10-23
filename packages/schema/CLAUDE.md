# @kaja/schema

Single source of truth for Zod schemas and related TypeScript types across the monorepo, split into role-based subpaths so unrelated concerns (e.g. two different things both called "model") never collide on import.

## Layout

Each directory is its own subpath export (`@kaja/schema/<dir>`); there is no bare `@kaja/schema` import. Pick the subpath by what the schema describes, not by which app consumes it.

```
api/         # API contracts shared by API, web and CLI device auth (index.ts re-exports and holds KAJA_TUI_CLIENT_ID = "kaja-tui")
config/      # CLI on-disk config files the user hand-edits (settings, models, secrets, commands, hooks), plus config/catalog.toml's schema; `mcp.ts` is only the MCP connection entry built from an ability's mcp.toml
store/       # stored runtime state (sessions, memory notes) used by @kaja/nasi; `StoredConversationSchema` validates a loaded conversation and its type fits nasi's `Session`, so stores hand it over without a cast
cli/         # re-exports abilities/dataset.ts and abilities/persona.ts
nasi/        # Nasi HTTP turn contract (request/response, steps, session meta)
abilities/   # Marketplace ability content (SKILL.md frontmatter, HTTP tool, MCP and persona manifests), shared by every host that loads abilities
env/         # Per-app env schemas (api, web, sandbox, tui) + helpers (parseEnv, bool/url/positiveInt/trimmed); the source of `.env.example` and `env.d.ts`. tui's covers only KAJA_API_URL, KAJA_LOG_LEVEL, KAJA_LOG_FILE (locale vars and a hyperlink-support workaround stay plain process.env reads)
tombi/       # TOML<->JSON schema generator, wired into root `generate:schemas`
```

## Conventions

- Zod **v4** only
- Export both schemas and inferred types (`z.infer<typeof …>`), consistently with existing files
- Date fields that cross JSON boundaries: `z.coerce.date()`; UUIDs: `z.uuidv7()` where the API uses UUIDv7
- Pure schemas only: no runtime I/O, React, or Hono, and no DB row types (those stay private in API services)
- Same-named-but-unrelated types across subpaths (e.g. `api`'s `ResolvedModel` vs `config`'s `CliResolvedModel`) are fine, that's what the split is for. Rename only when a collision would genuinely confuse a reader importing from two subpaths in one file
- Changing a schema is a breaking change for all consumers of that subpath: update every consumer and its tests together
