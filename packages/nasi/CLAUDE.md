# @kaja/nasi

The agent brain: OpenAI-compatible tool loop, the store interface and `createSqlStore` (SQLite in the TUI, Postgres in the API), built-in tools, and `Nasi`, the cloud turn wrapper. `@kaja/nasi/client` is the TUI's cloud mode: a thin SSE client, no store or loop.

Hosts inject the store, model client, prompt context and `includeLocalTools` (files, shell, MCP; default false). This package never reads `settings.toml`, opens a database or runs DDL (it exports `SQLITE_SCHEMA` for the TUI), and has no Ink, Hono, Better Auth, `bun:sqlite` or pg.

## Conventions

- Never log prompts, memory content or API keys. Recoverable problems go through `warn` (hosts route it with `setWarnHandler`)
- `createSqlStore` runs the same SQL on both engines: stay in their common dialect (no `::casts`, `NOW()`, `ANY()`, `INSERT OR IGNORE`, `PRAGMA`), values through `sql-codec.ts`. Scope every statement by `userId`; every write goes through `sql.begin` (on SQLite a plain query joins another save's open transaction). Columns must match `apps/api/migrations/2026-09-07-nasi.sql`
- The system prompt is built when a conversation starts; `refreshAbilitiesInPrompt` rebuilds it only when its skills/personas sections change, keeping prompt caching
- `run_command` skips approval only via `isSafeCommand` (`agent/command-risk.ts`); the model's `mutates` flag is only a hint. Children register with `trackProcess`
- Built-in tools declare a zod `schema` in `tool()`; tools with an outside JSON Schema (MCP, HTTP, code tools) pass `parameters` only
- A tool that throws never aborts the turn: its call gets `Error: <message>`; the run stops after `MAX_FAILING_TOOL_ROUNDS` all-failing rounds
- Every tool goes through `mergeTools` (`tools/registry.ts`): official names are reserved, other clashes keep the first. Host tools enter via `createTools`' `extraTools`
- Telemetry: `run()` records rounds and calls on `session.telemetry`; a host answering a paused call itself calls `recordPausedCall` first
- `ask_user` `options` (2-6) are optional shortcuts: the question must read fine without them. `pendingQuestionOptions(session)` lets a host check a later tap against the session alone

## Approvals

A tool's `approval(args)` returning a summary pauses `run()` with `confirm_tool` (`session.pendingToolApprovalId`); the host runs it via `runApprovedTool` once approved. Over `Nasi` the next turn's `approval` answers it, and Nasi runs the call the session saved (`pendingToolCall`), never one the client describes; a plain message skips it. `approve_session` adds `<source>:<name>` (`agent/tool-allow.ts`) to `session.grantedTools`. `NasiOpenOptions.egress(ability?)` hands out request senders; unset connects from this host, and a cloud turn then has no `fetch_url`.

## Personas and abilities

- A broken ability is skipped with a warning, never thrown
- `personaTools` decides each round's tools: builtins always, except `OPT_IN_BUILTINS` (`fetch_url`, `generate_image`, `edit_image`), which a persona with an `abilities` list must list; an ability's tools only when the active persona lists it. No persona = every tool. Recomputed per round, so `switch_persona` applies next round
- MCP abilities connect lazily (`lazyMcpAbilities`), in parallel, each with `mcpConnectTimeoutMs`. In the cloud each connects over HTTP through `createGuardedFetch` (`security/ssrf.ts`); `Nasi.close()` shuts them
- `resolveLaunch` (`mcp/launch.ts`) starts a manifest's `package` (npm on the host's bun, else npx/pnpm; pypi via uvx/pipx; docker last) or `command`; none installed → the ability is left out (`missingRunners`). The cloud never resolves
- **Roots** (`roots = true`): folders come from personas. `ensureAbilities` sends `roots/list_changed` and waits `ROOTS_SETTLE_MS` (MCP has no ack). Read-only and backed-up roots need the manifest's `pathArgs`; `refuse` blocks a writing call before it runs, `beforeWrite` copies to `backupDir` (local only)

## Client tools

`NasiOpenOptions.client` declares tools the user's computer runs each turn (`clientToolGroups` stubs with `runsOnClient`; `withClientAbilities` hides the store's copies). `run()` runs the rest first, then pauses with `client_tool_calls` (`needs_client_tool`); the next turn's `toolResults` go through `answerClientCalls` (missing → `CLIENT_GONE`).

## Images

- Normalised where they arrive (`normalizeImage`: max 1568 px, EXIF dropped) and stored via `NasiStore.images(session.id)`, no other copy; a tool's images are bytes, never temp files
- `ImageSource` alt is only what the source gave; file names carry no path; a later arrival fills only empty fields
- Messages hold `kaja-image:<id>` refs; `resolveImageRefs` loads bytes right before the provider call. Sessions get an id from `createSession()` so images have a home before the first save
- Each image's label starts as its alt; `Agent.describer` (the `vision` model) replaces it with a description. A model that can't see (`seesImages`) waits for descriptions; images before `KEEP_IMAGE_TURNS` keep only labels
- `run()` places `kaja-image:` links in `message`/`final`/`ask_user` events (public URL in the cloud, file locally). A reply's remote `![](https://…)` images are stored too (`storeRemoteImages`), only where the agent has `fetch_url`
- `view_image` never reads secrets.toml or the store; `edit_image` is one operation per step
