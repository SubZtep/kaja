# @kaja/nasi

Kaja's agent brain: an OpenAI-compatible tool loop, a store interface (sessions, memory, datasets), the built-in tools, and ability loading (skills, HTTP tools, MCP servers, personas).

Hosts construct it. This package has no Ink, Hono, Better Auth, sqlite, or pg, and **does not read `settings.toml`** — the host injects a store, the model client, prompt context, and whether local tools are on.

```
src/
  nasi.ts            # Nasi host: turn() / turnBuffered() / compact() over a NasiStore
  agent/             # Agent, run(), system prompt, intercepts, compaction
  store/             # NasiStore interface, in-memory adapter, image helpers (CLI sqlite, API Postgres live in the hosts)
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + createTools({ includeLocalTools })
  abilities/         # AbilityStore, the marketplace folder store, loadAbilities (skills, HTTP tools, MCP, personas)
  mcp/               # MCP clients: mcp.toml servers (local) and MCP abilities (local, or remote in the cloud)
  plugin/            # attached when includeLocalTools and pluginDir are set
  client/            # HTTP client for the cloud CLI (no loop)
  security/          # SSRF guard (the path guard is tools/path-guard.ts)
```

## Entry points

| Import | What it is |
|--------|------------|
| `@kaja/nasi` | Full package: `Nasi`, `Agent`, `run()`, store interface, tools. Pulls in the loop. |
| `@kaja/nasi/client` | `createNasiClient` — `POST /nasi/turn` (buffered) and `POST /nasi/turn/stream` (SSE). Used by the cloud CLI. Must not import the agent loop. |

Contracts live in `@kaja/schema/nasi` (HTTP turn), `@kaja/schema/store` (sessions and notes), `@kaja/schema/abilities` (personas, datasets, skill/HTTP tool/MCP manifests).

## Hosts

- **API** (`apps/api`) opens `Nasi` with a Postgres store scoped to the account (local tools off). `owner` scopes widget/telegram rows within that account.
- **CLI `--local`** builds an `Agent` itself (`createTools({ includeLocalTools: true, mcpServers, … })`) and calls `run()` — same loop, no HTTP.
- **CLI cloud** uses `@kaja/nasi/client` against the API. No local loop, MCP or shell; it only runs `read_file`/`list_files` when a turn pauses with `needs_client_tool`.

---

## Input and output

There are two layers. HTTP and `Nasi` share the schema in `@kaja/schema/nasi`. The CLI local path uses `Agent` + `run()` and consumes the event stream directly.

### 1. `Nasi` / HTTP turn

**Construct**

```ts
const nasi = await Nasi.open({
  store,                           // sessions, memory, datasets
  chat: { client, model },         // OpenAI-compatible client
  includeLocalTools?,              // files, shell, MCP, plugins — default false
  personas?,                       // roster for switch_persona
  promptContext?,                  // system-prompt bits (env, sticky notes, …)
  owner?,                          // null = terminal; otherwise a namespaced id
  deps?,                           // extra tool deps (imageGeneration, fetchProxy, …), gate dep-conditional tools
  clientTools?                     // false: leave out read_file/list_files (no client to run them: widget, Telegram)
})
```

`owner` is compared on resume: a session id that belongs to a different owner in the same db is `NasiSessionNotFound`. Widget visitors sharing one account file must not resume each other.

**Turn input** (`NasiTurnRequest` plus optional `personaId` on the class):

| Field | Type | Notes |
|-------|------|--------|
| `message` | string, 1–32768 chars | User text. If the session is waiting on `ask_user`, `run_command` or a client tool, this is the reply / approval / tool output, not a new user message. Optional over HTTP when `approval` is sent. |
| `approval` | `"approve"` \| `"decline"`, optional | HTTP only: answers a pending `confirm_tool`; the server runs (or skips) the call it saved. |
| `session` | UUIDv7, optional | Omit to start a conversation. Pass the previous response's `session` to continue. |
| `includeThinking` | boolean, optional | When true, reasoning is copied into `steps` and `thinking`. |
| `language` | string, optional | Reply language override. |
| `personaId` | string, optional | Only on `NasiTurnInput` (in-process). Picks the starting persona from the roster. |

**Turn output** (`NasiTurnResponse`):

| Field | Type | Notes |
|-------|------|--------|
| `session` | UUIDv7 | Persist this and send it back on the next turn. |
| `status` | `"completed"` \| `"needs_input"` \| `"needs_approval"` \| `"needs_client_tool"` \| `"error"` | `needs_input` = `ask_user` pending; `needs_approval` = `run_command` or `confirm_tool` waiting; `needs_client_tool` = the client must run `read_file`/`list_files` and send the output as the next `message`. |
| `message` | string | Visible reply: final assistant text, or the pending question. |
| `steps` | `NasiStep[]` | Ordered timeline for this turn (not the full history). |
| `thinking` | string, optional | Concatenated reasoning, only if `includeThinking`. |
| `usage` | `{ promptTokens?, model?, contextWindow? }`, optional | From the last usage event. |

**Steps** (`NasiStep`):

| `type` | Payload |
|--------|---------|
| `reasoning` | `text` (only when `includeThinking`) |
| `message` | `content` |
| `tool_call` | `name`, `arguments` (JSON string) |
| `tool_result` | `name`, `preview` (schema; the in-process mapper currently omits this) |
| `ask_user` | `question`, optional `note` |
| `persona_switch` | `personaId`, `label` |
| `confirm_command` | `command`, `description` |
| `confirm_tool` | `name`, `arguments`, `summary` — an HTTP tool or MCP call waiting for approval |
| `client_tool_call` | `name`, `arguments` — a tool only the client can run |

Deltas, usage, `final`, and image events are **not** steps. They either feed `message`/`thinking`/`usage` or are CLI-only UI events.

**APIs**

```ts
// Wait for the full response (also POST /nasi/turn).
const response: NasiTurnResponse = await nasi.turnBuffered(input)

// Yield AgentEvents live, then return the same NasiTurnResponse (also POST /nasi/turn/stream).
for await (const event of nasi.turn(input)) { /* AgentEvent, including delta */ }
// generator return value === NasiTurnResponse
```

The HTTP client (`@kaja/nasi/client`) takes the same request body. `turn_stream` yields `NasiStreamEvent`s and returns `{ session, status }` on the server's `done` event. Terminal `error` events throw `NasiStreamError`.

### 2. In-process loop (`Agent` + `run`)

Used by the local CLI. You own persistence; nasi only mutates the `Session` you pass in.

**Input**

```ts
const agent = new Agent({
  model, client, tools,
  personas?, personaId?, instructions?, sampling?,
  promptContext?, models?, createClient?
})

const session = createSession() // { messages, pendingAskUserId?, pendingRunCommandId? }

for await (const event of run(agent, prompt, session, owner)) { /* … */ }
```

- `prompt` — user text, or the answer/approval for a pending handoff.
- `session.messages` — OpenAI chat history, including the system prompt nasi writes on the first call.
- `owner` — forwarded to tools (`null` for a terminal session). Defaults to `LOCAL_OWNER`.

**Output** — `AsyncGenerator<AgentEvent, void>`:

| `type` | When |
|--------|------|
| `delta` | Token chunks (`channel`: `reasoning` \| `content`) |
| `reasoning` | Full reasoning for a round |
| `message` | Assistant text for a round |
| `tool_call` | Model invoked a tool (`name`, `arguments`) |
| `tool_image` | Image path to feed back as vision |
| `display_image` | Thumbnail for the UI only (not sent to the model) |
| `ask_user` | Stop and wait; next `prompt` becomes the tool result |
| `confirm_command` | Stop and wait for approval (`run_command`) |
| `confirm_tool` | Stop and wait for approval of an HTTP tool or MCP call that changes something |
| `client_tool_call` | Stop so the client runs `read_file`/`list_files` (cloud only) |
| `persona_switch` | Persona (and maybe model) changed mid-turn |
| `compacted` | The conversation was summarised before a round (`beforeTokens`, `afterTokens`, `dropped`) |
| `condensed` | An oversized tool result was condensed before a round (`tool`, `beforeTokens`, `afterTokens`) |
| `final` | Turn done (`content` may be a fallback if the model returned empty) |
| `usage` | `promptTokens`, `model`, `contextWindow` |

A trailing `?` on otherwise-final text is also emitted as `ask_user` (no pending tool id). `Nasi` maps that to `status: "completed"` so a rhetorical question does not stall the HTTP turn.

---

## Tools

`createTools({ includeLocalTools?, deps?, mcpServers?, pluginDir?, tempDir? })` builds the registry. Default is an explicit allowlist of cloud-safe built-ins; `includeLocalTools: true` adds files, shell, MCP and plugins. `generate_image` still needs an image-gen resolver in `deps`, and cloud `fetch_url` needs `fetchProxy`.

Intercepted by `run()` (never executed as normal tools): `ask_user`, `run_command`, `switch_persona`.

Tool `execute` returns `string` or `{ text, images?, displayImage? }`. Images cannot travel in `role: "tool"` messages, so the loop sends `text` as the tool result and follows with a user message carrying vision content.

## Store

`Nasi.open({ store })` takes a `NasiStore`. Nasi does not open a database.

- CLI: sqlite via `createSqliteStore(path)` (`apps/tui/lib/store/sqlite.ts`)
- API: Postgres via `createPostgresStore(pool, userId)` (`apps/api/.../pg-store.ts`)
- Tests: `createMemoryStore()`

`owner` still distinguishes widget/telegram rows inside one account (or one local file).

## Model client

`createOpenAIClient({ baseURL, apiKey, headers? })` — no process-wide singleton. The free-chat proxy may set `x-kaja-model`; `takeLastServedModel()` reads that for usage events.

## Tests

```bash
bun run --filter @kaja/nasi test
```
