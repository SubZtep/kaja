# @kaja/nasi

Kaja's agent brain: an OpenAI-compatible tool loop, a store interface (sessions, memory, datasets), the built-in tools, and ability loading (skills, HTTP tools, MCP servers, personas).

Hosts construct it. This package has no Ink, Hono, Better Auth, sqlite, or pg, and **does not read `settings.toml`**. The host injects a store, the model client, prompt context, and whether local tools are on.

How it works (the loop, events, turn statuses, system prompt, compaction) is written up once, in the docs: **[Agent brain](https://docs.kaja.io/development/nasi)**. This page is the quick map of the package.

```
src/
  nasi.ts            # Nasi host: turn() / turnBuffered() / compact() over a NasiStore
  agent/             # Agent, run(), system prompt, intercepts, compaction
  store/             # NasiStore interface, in-memory adapter, image helpers (CLI sqlite, API Postgres live in the hosts)
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + createTools({ includeLocalTools })
  abilities/         # AbilityStore, the marketplace folder store, loadAbilities (skills, HTTP tools, MCP, personas)
  mcp/               # MCP clients: mcp.toml servers (local) and MCP abilities (local, or remote in the cloud)
  client/            # HTTP client for the cloud CLI (no loop)
  security/          # SSRF guard (the path guard is tools/path-guard.ts)
```

## Entry points

| Import | What it is |
|--------|------------|
| `@kaja/nasi` | `Nasi`, `Agent`, `run()`, store interface, tools. Pulls in the loop. |
| `@kaja/nasi/client` | `createNasiClient` for `POST /nasi/turn` (buffered) and `/nasi/turn/stream` (SSE). Used by the cloud CLI. Must not import the agent loop. |

Contracts live in `@kaja/schema/nasi` (HTTP turn), `@kaja/schema/store` (sessions and notes) and `@kaja/schema/abilities` (personas, datasets, skill/HTTP tool/MCP manifests).

## Using it

```ts
// Hosted (API, widget): load a session, run one turn, save it
const nasi = await Nasi.open({ store, chat: { client, model }, includeLocalTools: false })
const response = await nasi.turnBuffered({ message: "Hello" })

// In-process (local CLI): you own persistence
const agent = new Agent({ model, client, tools })
for await (const event of run(agent, prompt, createSession(), owner)) { /* … */ }
```

`Nasi.open` also takes `personas`, `promptContext`, `owner`, `deps` and `clientTools`. The [docs](https://docs.kaja.io/development/nasi#inputs-and-outputs) explain each.

## Stores and model client

`Nasi.open({ store })` takes a `NasiStore`. Nasi never opens a database itself.

- CLI: sqlite via `createSqliteStore(path)` (`apps/tui/lib/store/sqlite.ts`)
- API: Postgres via `createPostgresStore(pool, userId)` (`apps/api/.../pg-store.ts`)
- Tests: `createMemoryStore()`

`createOpenAIClient({ baseURL, apiKey, headers?, fetch? })` builds a client, with no process-wide singleton. The cloud passes `createGuardedFetch()` as `fetch` (and to `resolveContextWindow`), so a model URL can't reach a private host; the TUI uses plain `fetch`, so a model on the local network works. The free-chat proxy may set `x-kaja-model`, and `takeLastServedModel()` reads that for usage events.

## Tests

```bash
bun run --filter @kaja/nasi test
```
