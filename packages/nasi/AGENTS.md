# @kaja/nasi

The agent brain: OpenAI-compatible tool loop, per-user SQLite (sessions as message and tool-call rows, memory, datasets), built-in tools.

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
  store/             # NasiStore interface + in-memory adapter; rows.ts splits a session into message/tool-call rows (and joins it back) for the sqlite and Postgres stores
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + createTools({ includeLocalTools })
  mcp/               # includeLocalTools only
  plugin/            # includeLocalTools only
  packages/          # PackageStore interface, folder store, loadPackages, load_skill (skills), HTTP tool executor + key check, MCP package targets
  client/            # HTTP client for lite CLI: turn() buffered, turn_stream() SSE (no sqlite / loop)
  security/          # SSRF + path guard
```

## Conventions

- No reads of `settings.toml`. Hosts inject store, model client, prompt context.
- `includeLocalTools` (default false): files, shell, MCP, plugins.
- The system prompt is built when a conversation starts; after that, `refreshPackagesInPrompt` (every turn, in `run`) rebuilds it only when the `## Skills` or `## Personas` section no longer matches what's enabled, so toggles reach running conversations without breaking prompt caching.
- A tool may set `approval(args)`: when it returns a summary, run() pauses with `confirm_tool` (`session.pendingToolApprovalId`) instead of executing, and the host runs it via `runApprovedTool` once the human approves — same shape as run_command's `confirm_command`. Non-GET HTTP tools use this. Over `Nasi` (the cloud) the next turn's `approval: "approve" | "decline"` answers it: Nasi runs the call the session saved (`pendingToolCall`), never one the client describes, and a plain message instead skips it. `NasiOpenOptions.packageKey` hands packages their keys; `deps.fetchProxy` doubles as their proxy.
- MCP servers (mcp.toml's and packages', via `createTools`' `mcpPackages`) connect in parallel, each with a timeout (`mcpConnectTimeoutMs`, default 10 s). `connectMcpServer` takes `transport` (http/sse), an `allow` list and `approval` (never/writes/always; `writes` uses the tool's `readOnlyHint`). In the cloud (`includeLocalTools` false) only remote packages connect, and only with `mcpFetch` — `Nasi` passes `createGuardedFetch` (`security/ssrf.ts`: every hop checked, same-origin redirects only, bodies streamed, proxy when set) — with images dropped and results capped; `Nasi.close()` shuts them.
- Every tool goes through `mergeTools` (`tools/registry.ts`): one namespace, each tool stamped `origin` (`official` built-ins, `community` packages, `third-party` MCP/plugins) + `source`. Official names are reserved; other clashes keep the first (community before third-party) and land in `skipped`. Host-provided tools come in through `createTools`' `extraTools`, never appended afterwards.
- Packages come from a host-provided `PackageStore` (`createFolderPackageStore` for the CLI); `loadPackages` returns extra tools the host appends. A broken package is skipped with a warning, never thrown.
- Parameterized SQL only. Session ids are UUIDv7 text.
- Do not log prompts, memory content, or API keys.
- Telemetry: `run()` records each model round (`StepStat`: served model, persona, tokens, latency, finish reason) and each tool call it runs (`CallStat`: status, duration) on `session.telemetry`; a host that answers a paused call itself records it with `recordPausedCall` before the answer reaches `run()`. A store writes it beside the rows it saves and then takes it off the session (`clearTelemetry`), so telemetry always covers what's new since the last save. A call's status stays unset when a person or a client answered it.
