# @kaja/sandbox

Runs stdio MCP servers for cloud turns, which can't start commands on the API host. Each server is served over Streamable HTTP at `/mcp/<ability>`, so the cloud agent connects to it like any remote MCP server.

## How it fits

- The API offers a stdio MCP ability (keyless, with a `tools` list) only when `SANDBOX_URL` and `SANDBOX_SECRET` are set (`cloudMcpProblem` in `apps/api/src/services/ability.ts`)
- A cloud turn gets `mcpSandbox` (`apps/api/src/features/nasi/chat.ts`): nasi's `sandboxedMcpTarget` turns each stdio ability into `<SANDBOX_URL>/mcp/<name>` with `Authorization: Bearer <token>`, and the guarded fetch trusts that origin (no SSRF checks, no proxy)
- The token (`signSandboxToken` in `@kaja/shared`) is HMAC-SHA256 over `{ sub: userId, ability, exp }`; the sandbox refuses a wrong signature, an expired token, or one for another ability

## Layout

```
src/server.ts     # entry: env, manifests, Bun.serve, stops every server on SIGTERM/SIGINT
src/app.ts        # Hono routes: GET /health, ALL /mcp/:ability (token check)
src/pool.ts       # ProcessPool: one relay per (user, ability); idle stop (SANDBOX_IDLE_MS), cap (SANDBOX_MAX_PROCESSES, 503 past it)
src/relay.ts      # McpRelay: one stdio child shared by many HTTP sessions; renumbers request ids, initializes the child once
src/manifests.ts  # the stdio manifests it may run, plus overrides.json
overrides.json    # the Docker image's command/args for chrome-devtools (Node + Chrome for Testing headless shell, --no-sandbox, http(s) pages only)
Dockerfile        # the sandbox compiled to one binary (bun build --compile) on node:22-trixie-slim
```

## Docker image

- Runtime is `node:22-trixie-slim`: stdio MCP servers are Node programs (chrome-devtools-mcp needs Node 20.19+/22.12+); Bun only lives inside the compiled `sandbox` binary
- Chrome is the Chrome for Testing headless shell at the version chrome-devtools-mcp's Puppeteer pins (`PUPPETEER_REVISIONS` in its bundle): bump `CHROME_DEVTOOLS_MCP_VERSION` and `CHROME_HEADLESS_SHELL_VERSION` together
- Only the libraries the headless shell links are installed; `libgbm.so.1` is copied alone out of its .deb, since its Mesa backends (~190 MB with LLVM) never load for SwiftShader rendering
- amd64 only: Chrome for Testing has no Linux arm64 builds (Debian's `chromium` would be the arm64 route)
- A Python (`uvx`) or other-runtime MCP server would need that runtime too; past one or two, an image per server or a container per session fits better than one image with every runtime

## Rules

- Commands only ever come from the sandbox's own manifests (`MARKETPLACE_DIR/mcp`) and `SANDBOX_OVERRIDES`; a request only names the ability
- A child gets PATH, a throwaway HOME (removed when it stops) and its manifest's `env`, nothing else from the sandbox's environment
- Chrome only opens `http://` and `https://` (`--allowedUrlPattern` in `overrides.json`): every user's browser runs as the same `node` user, so a `file://` page could read another user's profile under `/tmp`. The allowlist needs Chrome 149+
- Every new API turn opens a new MCP session; the relay answers later `initialize` calls from the first one, so the server's state (a browser's pages) survives between turns
- Server-to-client requests (sampling, roots, elicitation) get "method not found"; only ping is answered

## Security

Chrome browses anything the container can reach, and the API's SSRF guard doesn't cover it. In `compose.yaml` the sandbox has its own network (only the api joins it), so `db` and `mail` don't resolve, and every port is published on `127.0.0.1` only, so the host's gateway address doesn't reach them either (a port published on all interfaces would be). Anything else the host or its network serves is still reachable: production runs it on a separate host (egress rules that allow only the public internet would do too).

## Not yet

- Forwarding users' keys (`auth.in = "env"`) — keyed stdio abilities are refused on both sides
- Per-user limits beyond one process per (user, ability)
- A published image in `.github/workflows/dockerhub.yaml` (production deploys build `apps/sandbox/disco.json` on its own Disco server; see `docs/development/deployment.md`)

## Testing

`bun test apps/sandbox/tests` runs a fixture stdio server (`tests/fixtures/counter-server.ts`) through the real relay; the API's `ability-mcp.test.ts` drives a cloud turn through an in-process sandbox.
