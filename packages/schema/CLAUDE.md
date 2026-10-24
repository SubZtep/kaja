# @kaja/schema

Every Zod schema (v4) lives here, split into role-based subpaths (`@kaja/schema/<dir>`, no bare import) so unrelated things with the same name never collide.

- Pick the subpath by what the schema describes, not by which app consumes it. Same-named types across subpaths (`api`'s `ResolvedModel`, `config`'s `CliResolvedModel`) are the point of the split
- Pure schemas: no I/O, React, Hono or DB row types
- JSON dates: `z.coerce.date()`; API ids: `z.uuidv7()`
- `config/` is the CLI's hand-edited files
- `store/`'s `StoredConversationSchema` type fits nasi's `Session`, so stores hand it over without a cast
- `env/` generates the `.env.example` files and `env.d.ts`; the tui's schema covers only `KAJA_API_URL`, `KAJA_LOG_LEVEL`, `KAJA_LOG_FILE`
