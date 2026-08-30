# @kaja/nasi

The agent brain: OpenAI-compatible tool loop, per-user SQLite (sessions, memory, datasets), built-in tools.

Hosts (full CLI, API) construct it. This package has no Ink, Hono, or Better Auth.

## Commands

```bash
bun run --filter @kaja/nasi test
```

## Layout

```
src/
  index.ts           # public API
  agent/             # Agent, run(), system prompt, intercepts
  store/             # bun:sqlite schema + sessions/memory/datasets
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + local/hosted registries
  mcp/               # local profile only
  plugin/            # local profile only (~/.config/kaja/tools)
  client/            # HTTP client for lite CLI: turn() buffered, turn_stream() SSE (no sqlite / loop)
  security/          # SSRF + path guard
```

## Profiles

- `local` — full toolset including files, shell, MCP, plugin `.ts`
- `hosted` — closed allowlist: memory, personas, search, fetch_url, ask_user, dataset_info. Never shell/files/MCP/plugins.

## Conventions

- No reads of `settings.toml`. Hosts inject db path, model client, prompt context, extra tools.
- Parameterized SQL only. Session ids are UUIDv7 text.
- Do not log prompts, memory content, or API keys.
