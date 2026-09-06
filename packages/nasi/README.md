# @kaja/nasi

Kaja's agent brain: an OpenAI-compatible tool loop, per-user SQLite (sessions, memory, datasets), and built-in tools.

Hosts construct it. This package has no Ink, Hono, Better Auth, and **does not read `settings.toml`** — the host injects the db path, model client, prompt context, and whether local tools are on.

```
src/
  nasi.ts            # Nasi host: turn() / turnBuffered() over SQLite
  agent/             # Agent, run(), system prompt, intercepts
  store/             # bun:sqlite schema + sessions / memory / datasets
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + createTools({ includeLocalTools })
  mcp/               # attached when includeLocalTools and mcpServers are set
  plugin/            # attached when includeLocalTools and pluginDir are set
  client/            # HTTP client for lite CLI (no sqlite / loop)
  security/          # SSRF + path guard
```

## Entry points

| Import | What it is |
|--------|------------|
| `@kaja/nasi` | Full package: `Nasi`, `Agent`, `run()`, store, tools. Pulls sqlite and the loop. |
| `@kaja/nasi/client` | `createNasiClient` — `POST /nasi/turn` (buffered) and `POST /nasi/turn/stream` (SSE). Used by the lite CLI. Must not import sqlite or the agent loop. |

Contracts live in `@kaja/schema/nasi` (HTTP turn), `@kaja/schema/store` (SQLite rows), `@kaja/schema/cli` (personas).

## Hosts

- **API** (`apps/api`) opens `Nasi` with a per-account sqlite file (local tools off by default). `owner` scopes rows inside that file (account vs widget visitor).
- **CLI `--local`** builds an `Agent` itself (`createTools({ includeLocalTools: true, mcpServers, … })`) and calls `run()` — same loop, no HTTP.
- **CLI hosted / lite** uses `@kaja/nasi/client` against the API. No local sqlite, MCP, or shell.

---

## Input and output

There are two layers. HTTP and `Nasi` share the schema in `@kaja/schema/nasi`. The CLI local path uses `Agent` + `run()` and consumes the event stream directly.

### 1. `Nasi` / HTTP turn

**Construct**

```ts
const nasi = await Nasi.open({
  dbPath,                          // sqlite file; created if missing
  chat: { client, model },         // OpenAI-compatible client
  includeLocalTools?,              // files, shell, MCP, plugins — default false
  personas?,                       // roster for switch_persona
  promptContext?,                  // system-prompt bits (env, location, sticky notes, …)
  owner?                           // null = terminal; otherwise a namespaced id
})
```

`owner` is compared on resume: a session id that belongs to a different owner in the same db is `NasiSessionNotFound`. Widget visitors sharing one account file must not resume each other.

**Turn input** (`NasiTurnRequest` plus optional `personaId` on the class):

| Field | Type | Notes |
|-------|------|--------|
| `message` | string, 1–32768 chars | User text. If the session is waiting on `ask_user` or `run_command`, this is the reply / approval, not a new user message. |
| `session` | UUIDv7, optional | Omit to start a conversation. Pass the previous response's `session` to continue. |
| `includeThinking` | boolean, optional | When true, reasoning is copied into `steps` and `thinking`. |
| `personaId` | string, optional | Only on `NasiTurnInput` (in-process). Picks the starting persona from the roster. |

**Turn output** (`NasiTurnResponse`):

| Field | Type | Notes |
|-------|------|--------|
| `session` | UUIDv7 | Persist this and send it back on the next turn. |
| `status` | `"completed"` \| `"needs_input"` \| `"needs_approval"` \| `"error"` | `needs_input` = `ask_user` pending; `needs_approval` = `run_command` waiting. |
| `message` | string | Visible reply: final assistant text, or the pending question. |
| `steps` | `NasiStep[]` | Ordered timeline for this turn (not the full history). |
| `thinking` | string, optional | Concatenated reasoning, only if `includeThinking`. |
| `usage` | `{ promptTokens?, model? }`, optional | From the last usage event. |

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
| `persona_switch` | Persona (and maybe model) changed mid-turn |
| `final` | Turn done (`content` may be a fallback if the model returned empty) |
| `usage` | `promptTokens`, `model` |

A trailing `?` on otherwise-final text is also emitted as `ask_user` (no pending tool id). `Nasi` maps that to `status: "completed"` so a rhetorical question does not stall the HTTP turn.

---

## Tools

`createTools({ includeLocalTools?, deps?, mcpServers?, pluginDir?, tempDir? })` builds the registry. Default is no files/shell/MCP/plugins; `includeLocalTools: true` adds those. `web_search` / `generate_image` still need a search key / image-gen resolver in `deps`.

Intercepted by `run()` (never executed as normal tools): `ask_user`, `run_command`, `switch_persona`.

Tool `execute` returns `string` or `{ text, images?, displayImage? }`. Images cannot travel in `role: "tool"` messages, so the loop sends `text` as the tool result and follows with a user message carrying vision content.

## Store

SQLite at the host-provided `dbPath`. Schema version is `SCHEMA_VERSION` (currently 8).

| Table | Role |
|-------|------|
| `sessions` | Conversation rows: id (UUIDv7 text), persona, model, title, owner, `session` JSON, `events` JSON |
| `notes` | Memory (`remember_note` / `recall_memory` / …) |
| `dataset_answers` / `dataset_versions` | Structured collection bound to a persona's `dataset` topic |

Parameterized SQL only. `withStorePath` / `withStorePathGenerator` keep concurrent opens on different files isolated via `AsyncLocalStorage`.

## Model client

`createOpenAIClient({ baseURL, apiKey, headers? })` — no process-wide singleton. The free-chat proxy may set `x-kaja-model`; `takeLastServedModel()` reads that for usage events.

## Tests

```bash
bun run --filter @kaja/nasi test
```
