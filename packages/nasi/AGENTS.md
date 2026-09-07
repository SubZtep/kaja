# @kaja/nasi

The agent brain: OpenAI-compatible tool loop, per-user SQLite (sessions, memory, datasets), built-in tools.

Hosts (full CLI, API) construct it and pass a store, model client, prompt context, and `includeLocalTools`. This package has no Ink, Hono, Better Auth, sqlite, or pg.

## Commands

```bash
bun run --filter @kaja/nasi test
```

## Layout

```
src/
  index.ts           # public API
  agent/             # Agent, run(), system prompt, intercepts
  store/             # NasiStore interface + in-memory adapter
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + createTools({ includeLocalTools })
  mcp/               # includeLocalTools only
  plugin/            # includeLocalTools only
  client/            # HTTP client for lite CLI: turn() buffered, turn_stream() SSE (no sqlite / loop)
  security/          # SSRF + path guard
```

## Conventions

- No reads of `settings.toml`. Hosts inject store, model client, prompt context.
- `includeLocalTools` (default false): files, shell, MCP, plugins.
- Parameterized SQL only. Session ids are UUIDv7 text.
- Do not log prompts, memory content, or API keys.
