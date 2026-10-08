---
name: add-mcp
description: Turn a pasted MCP server config (usually JSON) into a ../marketplace/abilities/<name>/mcp.toml ability, with its tools listed live from the server. Only when the user runs /add-mcp.
argument-hint: "<MCP server config, e.g. JSON>"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash(bun .claude/skills/add-mcp/scripts/list-tools.ts *), Bash(bun scripts/tool.ts tombi *), WebFetch
---

# Add an MCP server to the marketplace

Turn the MCP server config below into a marketplace MCP ability at `../marketplace/abilities/<name>/mcp.toml`: a reviewed manifest that the TUI runs locally and the cloud runs remotely or in the MCP sandbox.

```
$ARGUMENTS
```

The input is usually JSON in one of the common client shapes:

- `{ "mcpServers": { "<id>": {...} } }` (Claude Desktop, Cursor)
- `{ "servers": {...} }` or `{ "mcp": { "servers": {...} } }` (VS Code)
- a bare server object

It may also be a `claude mcp add ...` command line, or prose with a URL; read those the same way. Several servers in one input make one file each.

## Rules

- **Never write a real key into a manifest.** If the input holds one, leave it out and tell the user that it belongs in `secrets.toml` under `[abilities.<name>]`, and that they should rotate it, since it was pasted.
- **Never overwrite** an existing `../marketplace/abilities/<name>/mcp.toml` without asking (a folder that already holds other parts, like a SKILL.md, is fine to add to).
- **Tools come from the server**, not guesses: list them live (step 3), or from the server's own docs when that's impossible, and say which.
- **Don't commit**; the user reviews and commits.

## 1. Learn the format

Read these before writing anything:

- `../marketplace/README.md`, the MCP bullets
- `packages/schema/abilities/mcp.ts`: `McpAbilitySchema` is the source of truth. It generates `config/schemas/mcp-ability.json`, which tombi applies to `../marketplace/abilities/*/mcp.toml`.
- every existing `../marketplace/abilities/*/mcp.toml`, as style examples

Don't use `config/schemas/mcp.json`: that describes the user's own `mcp.toml`, a different format.

## 2. Map the fields

| Input | Manifest |
|-------|----------|
| server key / id | the ability folder `../marketplace/abilities/<name>/`: lowercase letters, digits and single hyphens (the manifest itself has no `name`; one is refused). Drop filler such as `-mcp` and `mcp-server-` (`mcp-server-time` → `time`) |
| `command` + `args` | `transport = "stdio"`, `command`, `args`. Keep the command as written (`npx`, `bunx`, `uvx`, `docker`, ...) |
| `url` / `serverUrl` / `httpUrl` | `url`, with `transport = "http"`, or `"sse"` when the type says sse or the URL ends in `/sse` |
| `type` / `transport` | only picks the transport above (`streamable-http` / `http` → `http`) |
| `env` / `headers` holding a key (a placeholder such as `YOUR_API_KEY`, `<token>` or `${...}`, or anything that looks secret) | `[auth]`: `type = "apiKey"`, `in = "env"` (stdio) or `"header"` (http/sse), `name` = the env var or header name, and `prefix` for anything before the key (`"Bearer "`). Add `optional = true` if the server also works without a key. Only one key per server is supported; if there are more, tell the user |
| `env` / `headers` that aren't secrets | `env` / `headers` tables, as they are |

## 3. List the tools

`tools` is the allowlist the model sees, and the cloud skips a server without one, so always set it. Write a draft manifest (step 4) first, then list the server's real tools:

```sh
bun .claude/skills/add-mcp/scripts/list-tools.ts ../marketplace/abilities/<name>/mcp.toml
```

It prints JSON: each tool's `name`, `readOnlyHint`, `destructiveHint`, `args` (optional ones end in `?`) and a shortened `description`. On failure it prints `list-tools: <reason>` and exits with 1 (2 for a usage error).

- A keyed server needs the key in front: `MCP_KEY=<key> bun .claude/skills/add-mcp/scripts/list-tools.ts ...`. The key goes where `[auth]` says and is never printed.
- A stdio server's first run downloads its package, so it gets up to 3 minutes.
- If the server refuses without a key you don't have, is legacy sse, or its command isn't installed here, take the tool list from the server's README (WebFetch) instead, and say so in the report.

Then choose:

- **`tools`**: the ones useful to a chat assistant, read tools first. Leave out admin, debug, duplicate and rarely useful tools, and keep the list short.
- **`approval`**:
  - `"never"` when every kept tool only reads.
  - `"writes"` when any can change something. Then check that each read tool has `readOnlyHint: true`, and list the ones that don't under `readOnly`. Use `unless` for arguments that turn a call into a write, such as a `filePath`.
  - `"always"` only for servers where even reads are sensitive.
- **`localOnlyArgs`**: arguments that only make sense on the user's machine, such as a file path to save to. The cloud hides them.
- **`trustedSandbox = true`** (stdio only): the server may see a user's logins or personal pages. It then runs only in their own MCP sandbox or the official one, never in one someone else shares.

## 4. Write the manifest

Match the existing files:

- **Header comment**, saying:
  - what the server is, with the project link;
  - for stdio: what must be installed locally (`bunx` needs Bun, `uvx` needs uv), and that the cloud runs it in the MCP sandbox (`apps/sandbox`) instead;
  - whether a key is needed or optional, and where to get one;
  - what asks first under `approval`.
- **Field order**: `description` (one sentence on what the user gets, at most 1024 characters), `transport`, then `url` or `command`/`args`, `env`/`headers`, `approval`, `tools`, `localOnlyArgs`, `trustedSandbox`, and last the `[auth]` and `[[readOnly]]` tables.
- **Omit defaults**: `approval = "never"`, empty `env`/`headers`, no `auth`, `trustedSandbox = false`.
- **Comments** are single lines, never wrapped.

## 5. Check

1. Schema, including the transport and auth rules tombi can't see. Run this in `packages/nasi`:
   ```sh
   bun -e 'import { parseMcpManifest } from "@kaja/nasi"; console.log(parseMcpManifest(await Bun.file("../../marketplace/abilities/<name>/mcp.toml").text(), "<name>"))'
   ```
2. Format and lint with the marketplace repo's own `.tombi.toml`: `cd ../marketplace && bun ../kaja/scripts/tool.ts tombi format abilities/<name>/mcp.toml && bun ../kaja/scripts/tool.ts tombi lint abilities/<name>/mcp.toml`
3. Rerun `list-tools.ts` if you haven't since the last edit, to confirm every name in `tools` exists.

## 6. Report

Show the final file, then say:

- **Tools**: where the names came from (live listing or docs), and which you left out and why.
- **Cloud (stdio)**: whether the sandbox image (`apps/sandbox/Dockerfile`, which has node/npx, bun/bunx and uv/uvx) can run the command.
  - A server that needs more (a browser, a binary, docker) works only locally until the sandbox gets it, and `apps/sandbox/overrides.json` may need a pinned entry like `chrome-devtools`'s.
  - A stdio server that needs a key never runs in the cloud.
- **Keys**: for a keyed server, the user adds the key in `secrets.toml` under `[abilities.<name>]` locally, or on the web's Abilities page for the cloud.
