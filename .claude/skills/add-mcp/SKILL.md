---
name: add-mcp
description: Turn a pasted MCP server config (usually JSON) into a marketplace/mcp/<name>.toml ability. Only when the user runs /add-mcp.
argument-hint: "<MCP server config, e.g. JSON>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash(bun .claude/skills/add-mcp/scripts/list-tools.ts *), Bash(bunx tombi *), WebFetch
---

Turn the MCP server config in the arguments into a marketplace MCP ability at `marketplace/mcp/<name>.toml`.

Input:

```
$ARGUMENTS
```

It is usually JSON in one of the common client shapes: `{ "mcpServers": { "<id>": {...} } }` (Claude Desktop, Cursor), `{ "servers": {...} }` / `{ "mcp": { "servers": {...} } }` (VS Code), or a bare server object. It may be a `claude mcp add ...` command line or plain prose with a URL instead; read it the same way. Several servers in one input → one file each.

## 1. Learn the format

Read `marketplace/README.md` (the MCP bullets), the zod schema `packages/schema/abilities/mcp.ts` (`McpAbilitySchema`, source of `docs/config/schemas/mcp-ability.json`, which tombi applies to `marketplace/mcp/*.toml`), and every existing `marketplace/mcp/*.toml` as style examples. Don't use `docs/config/schemas/mcp.json`: that is the user's own `mcp.toml`, a different format.

## 2. Map the fields

| Input | Manifest |
|-------|----------|
| server key / id | `name`: lowercase letters, digits, single hyphens; the file is `<name>.toml`. Drop filler like `-mcp`, `mcp-server-` (`mcp-server-time` → `time`). If the file exists, ask before overwriting |
| `command` + `args` | `transport = "stdio"`, `command`, `args`. Keep the command as written (`npx`, `bunx`, `uvx`, `docker` ...) |
| `url` / `serverUrl` / `httpUrl` | `url`; `transport = "http"`, or `"sse"` when the type says sse or the URL ends in `/sse` |
| `type` / `transport` | only picks the transport above (`streamable-http`/`http` → `http`) |
| `env` / `headers` holding a key (placeholder like `YOUR_API_KEY`, `<token>`, `${...}`, or anything that looks secret) | `[auth]`: `type = "apiKey"`, `in = "env"` (stdio) or `"header"` (http/sse), `name` = the env var / header name, `prefix` for what comes before the key (`"Bearer "`). `optional = true` if the server also works keyless. Only one key per server is supported; if there are more, tell the user |
| `env` / `headers` that aren't secrets | `env` / `headers` tables as-is |

Never write a real key into the file. If the input contains one, leave it out, and tell the user it belongs in their `secrets.toml` under `[abilities.<name>]` (and that they may want to rotate it, since it was pasted).

## 3. Find the tools

`tools` is the allowlist the model sees, and the cloud skips a server without one, so always set it. Write a draft manifest (step 4) first, then list the server's real tools:

```sh
bun .claude/skills/add-mcp/scripts/list-tools.ts marketplace/mcp/<name>.toml
```

It prints each tool's name, `readOnlyHint`, `destructiveHint`, argument names and description. A keyed server needs `MCP_KEY=<key>` in front; if you have no key and the server refuses, or it's legacy sse, or the command isn't installed here, get the tool list from the server's README (WebFetch) instead, and say so.

Then pick:

- `tools`: the useful ones for a chat assistant, in a sensible order (read tools first). Leave out admin, debug, duplicate and rarely useful tools; keep the list short.
- `approval`: `"never"` if every kept tool only reads; `"writes"` if any can change something (then check that each read tool has `readOnlyHint: true`, and list the ones that don't under `readOnly`, with `unless` for arguments that make a call write, like a `filePath`); `"always"` only for servers where even reads are sensitive.
- `localOnlyArgs`: arguments that only make sense on the user's machine (saving to a file path); the cloud hides them.

## 4. Write the file

Follow the existing files' style:

- A header comment: what it is and the project link; for stdio what must be installed locally (e.g. `bunx` needs Bun, `uvx` needs uv) and that the cloud runs it in the MCP sandbox (`apps/sandbox`) instead; whether a key is needed or optional and where to get one; what asks first under `approval`.
- `name`, `description` (one sentence, what the user gets, up to 1024 chars), `transport`, then `url` or `command`/`args`, `env`/`headers`, `approval`, `tools`, `localOnlyArgs`, then `[auth]` and `[[readOnly]]` tables. Omit fields left at their default (`approval = "never"`, empty `env`/`headers`, `auth` none).
- Comments are single lines, no wrapping.

## 5. Check

- Schema, including the transport/auth rules tombi can't see: `bun -e 'import { McpAbilitySchema } from "@kaja/schema/abilities"; console.log(McpAbilitySchema.parse(Bun.TOML.parse(await Bun.file("../../marketplace/mcp/<name>.toml").text())))'`, run in `packages/schema`.
- Format and lint: `bunx tombi format marketplace/mcp/<name>.toml && bunx tombi lint marketplace/mcp/<name>.toml`.
- Rerun `list-tools.ts` if you haven't yet, to confirm every name in `tools` exists.

## 6. Report

Show the final file, and say:

- where tool names came from (live listing or docs) and which tools you left out;
- for stdio: whether the sandbox image (`apps/sandbox/Dockerfile`) can run the command (it has node/npx, bun/bunx, uv/uvx); if the server needs more (a browser, a binary, docker), it only works locally until the sandbox gets it, and `apps/sandbox/overrides.json` may need a pinned entry like `chrome-devtools`'s. A stdio server that needs a key never runs in the cloud;
- for a keyed server: the user adds the key in `secrets.toml` under `[abilities.<name>]` locally, or on the web Abilities page for the cloud.

Don't commit; the user does.
