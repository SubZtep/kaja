# @kaja/nasi

The agent brain: OpenAI-compatible tool loop, the store interface (sessions as message and tool-call rows, memory, datasets; the hosts implement it over SQLite or Postgres), built-in tools, and `Nasi`, the cloud turn wrapper the API uses.

Hosts (full CLI, API) construct it and pass a store, model client, prompt context, and `includeLocalTools`. This package has no Ink, Hono, Better Auth, sqlite, or pg.

## Commands

```bash
bun run --filter @kaja/nasi test
```

## Layout

```
src/
  index.ts           # public API
  nasi.ts            # Nasi: the cloud turn (open a session, run, pause and resume, close)
  personas.ts        # dataset loaders the host registers (setDatasetLoaders, loadDataset)
  warn.ts            # warn + setWarnHandler
  agent/             # Agent, run(), system prompt, compaction, command risk, telemetry
  store/             # NasiStore interface + in-memory adapter; images.ts saveImages/loadImages/deleteImages; rows.ts splits a session into message/tool-call rows (and joins it back) for the sqlite and Postgres stores
  models/            # OpenAI client factory (no singleton)
  tools/             # builtin tools + createTools({ includeLocalTools })
  mcp/               # connectMcpServer: MCP abilities (also in the cloud)
  abilities/         # AbilityStore interface, folder store (marketplace/abilities/<name>/: SKILL.md, tool.toml, mcp.toml, tool.ts), loadAbilities, load_skill (skills), HTTP tool executor + key check, MCP ability targets, code tools
  client/            # `@kaja/nasi/client`, the TUI's cloud mode: info(), compact(), turn() buffered, turn_stream() SSE (no store / loop)
  security/          # SSRF guard (the path guard is tools/path-guard.ts)
```

## Conventions

- No reads of `settings.toml`. Hosts inject store, model client, prompt context.
- `includeLocalTools` (default false): files, shell, MCP. Code tools (an ability's `tool.ts`) come only from a store on the user's machine (`AbilityStore.listCodeTools`).
- The system prompt is built when a conversation starts; after that, `refreshAbilitiesInPrompt` (every turn, in `run`) rebuilds it only when the `## Skills` or `## Personas` section no longer matches what's enabled, so toggles reach running conversations without breaking prompt caching.
- `run_command` runs without asking only when `isSafeCommand` (`agent/command-risk.ts`) says so: a whole-command match on `Agent.safeCommands` (compiled from the TUI's `commands.toml`, else `DEFAULT_SAFE_COMMANDS`), no shell metacharacters, not `isDangerousCommand`, no path segment `secrets.toml` or `.ssh`. The model's `mutates` flag is only a hint. `runShellCommand` keeps 64 KiB of each stream and kills the child past that or after 15 s. Child processes (`runShellCommand`, the TUI's audio) register with `trackProcess` so `killTrackedProcesses` can stop them on quit.
- A tool may set `approval(args)`: when it returns a summary, run() pauses with `confirm_tool` (`session.pendingToolApprovalId`) instead of executing, and the host runs it via `runApprovedTool` once the human approves — same shape as run_command's `confirm_command`. Non-GET HTTP tools use this. Over `Nasi` (the cloud) the next turn's `approval: "approve" | "decline"` answers it: Nasi runs the call the session saved (`pendingToolCall`), never one the client describes, and a plain message instead skips it. `approval` may also be `approve_session` (the tool's allow key, `<source>:<name>` from `agent/tool-allow.ts`, joins `session.grantedTools`, so it stops pausing for the session); `run()` skips the pause for a tool matching the session's grants. `NasiOpenOptions.abilityKey` hands abilities their keys; `deps.fetchProxy` doubles as their proxy.
- Recoverable problems (a skipped ability, a missing key, a failed MCP connect, an unreachable fetch proxy) go through `warn` in `src/warn.ts`; hosts route them with `setWarnHandler` (`@kaja/nasi`), and it is silent until they do.
- Abilities' MCP servers (`createTools`' `mcpAbilities`) connect in parallel, each with a timeout (`mcpConnectTimeoutMs`, default 10 s). `connectMcpServer` takes `transport` (http/sse), an `allow` list and `approval` (never/writes/always; `writes` uses the tool's `readOnlyHint`). In the cloud (`includeLocalTools` false) only remote abilities connect, and only with `mcpFetch` — `Nasi` passes `createGuardedFetch` (`security/ssrf.ts`: every hop checked, same-origin redirects only, bodies streamed, proxy when set) — with images dropped and results capped; `Nasi.close()` shuts them.
- Every tool goes through `mergeTools` (`tools/registry.ts`): one namespace, each tool stamped `origin` (`official` built-ins, `community` abilities) + `source`. Official names are reserved; other clashes keep the first and land in `skipped`. Host-provided tools come in through `createTools`' `extraTools`, never appended afterwards.
- Abilities come from a host-provided `AbilityStore` (`createFolderAbilityStore` for the CLI); `loadAbilities` returns extra tools the host appends. A broken ability is skipped with a warning, never thrown.
- Personas fix the tools: `personaTools` (`agent/persona-tools.ts`, over `abilities/persona-scope.ts`'s `toolsForPersona`) is what each round sends and runs: builtins always, an ability's tools (`ability:<name>` source) only when the active persona's `abilities` lists it (narrowed by an entry's `tools`), `load_skill` only with a skill in `load` mode. An agent without a persona gets every tool. `run()` recomputes it per round, so `switch_persona` changes the next round's list; a call to another persona's tool gets a reason, not "unknown tool". A `sticky` skill's body is its own `## Skill: <name>` section in the system prompt (`LoadSkillTool.readBody`).
- MCP abilities connect lazily where the host asks (`createTools`' `lazyMcpAbilities`, used by `Nasi` and the TUI; the doctor connects all): `ensureAbilities(names)` connects the ones not tried yet, and `Agent.ensureTools` is how `run()` (`syncPersonaTools`, at turn start and in `applyPersonaToMessages`) asks for the active persona's; with no persona it asks for all.
- Parameterized SQL only. Session ids are UUIDv7 text.
- Do not log prompts, memory content, or API keys.
- Telemetry: `run()` records each model round (`StepStat`: served model, persona, tokens, latency, finish reason) and each tool call it runs (`CallStat`: status, duration) on `session.telemetry`; a host that answers a paused call itself records it with `recordPausedCall` before the answer reaches `run()`. A store writes it beside the rows it saves and then takes it off the session (`clearTelemetry`), so telemetry always covers what's new since the last save. A call's status stays unset when a person or a client answered it.
- Built-in tools declare their arguments as a zod `schema` in `tool()`: its JSON Schema (input side, no `$schema`) is what the model is sent, unless `parameters` spells that out (dataset_info keeps a flat object over its per-action union), and `run()`/`runApprovedTool` check the model's arguments with `checkToolArgs` before `execute`, sending `Invalid arguments for <tool>: …` back instead. Tools with an outside JSON Schema (MCP, HTTP abilities, code tools) pass `parameters` only and are taken as they are.
- A tool that throws (or isn't found) never aborts the turn: `run()` answers its call with `Error: <message>` so the model can react and the session stays valid, and records status `error`. Rounds where every call failed are counted, and the run stops after three in a row (`MAX_FAILING_TOOL_ROUNDS`).
