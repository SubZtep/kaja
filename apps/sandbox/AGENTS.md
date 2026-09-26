# @kaja/sandbox

Runs stdio MCP servers for cloud turns, which can't start commands on the API host. Each server is served over Streamable HTTP at `/mcp/<ability>`, so the cloud agent connects to it like any remote MCP server.

The human-facing overview (request flow, warm servers, how the egress proxy works and why `SANDBOX_EGRESS_PORT` must match `overrides.json`) is [README.md](./README.md); keep it in step with changes here.

## How it fits

- The API offers a stdio MCP ability (keyless, with a `tools` list) only when `SANDBOX_URL` and `SANDBOX_SECRET` are set (`cloudMcpProblem` in `apps/api/src/services/ability.ts`)
- A cloud turn gets `mcpSandbox` (`apps/api/src/features/nasi/chat.ts`): nasi's `sandboxedMcpTarget` turns each stdio ability into `<SANDBOX_URL>/mcp/<name>` with `Authorization: Bearer <token>`, and the guarded fetch trusts that origin (no SSRF checks, no proxy)
- The token (`signSandboxToken` in `@kaja/shared`) is HMAC-SHA256 over `{ sub: userId, ability, exp }`; the sandbox refuses a wrong signature, an expired token, or one for another ability

## Layout

```
src/server.ts     # entry: env, manifests, Bun.serve, stops every server on SIGTERM/SIGINT
src/app.ts        # Hono routes: GET /health, GET /stats (token for SANDBOX_STATS_SCOPE), ALL /mcp/:ability (token check)
src/pool.ts       # ProcessPool: one relay per (user, ability); idle stop (SANDBOX_IDLE_MS), cap (SANDBOX_MAX_PROCESSES): full, it stops the least recently used idle server, 503 only when all are mid-call
src/relay.ts      # McpRelay: one stdio child shared by many HTTP sessions; renumbers request ids, initializes the child once
src/stats.ts      # /stats: pool servers and counts, process-tree RSS from /proc, host + cgroup memory, egress counts
src/egress.ts     # forward proxy on 127.0.0.1:SANDBOX_EGRESS_PORT the browsers must use: resolves each host itself, connects only to public addresses (the one it checked)
src/manifests.ts  # the stdio manifests it may run, plus overrides.json
src/report.ts     # Sentry in production (its own project): failed starts, servers that exit on their own (last 20 stderr lines), child errors
overrides.json    # the Docker image's command/args: chrome-devtools (still bunx, pinned, with the Chrome for Testing headless shell, --no-sandbox, http(s) pages only, the egress proxy, a 512 MB JS heap per page)
Dockerfile        # one multi-runtime image (node, bun, uv + python3, Chrome headless shell) running the bundled sandbox
```

## Docker image

- One multi-runtime image, so manifests run as written, as on the user's machine: `node:22-trixie-slim` (node/npx; chrome-devtools-mcp needs Node 20.19+/22.12+), `bun`/`bunx` copied from the builder stage, `uv`/`uvx` from `ghcr.io/astral-sh/uv` (pinned tag), and Debian's `python3` for uvx. No compilers or git yet: add them when a server needs to build from source
- The sandbox itself is one bundled file (`bun build --target=bun`) run by that same `bun`, so Bun isn't in the image twice
- An override only changes what the host needs (chrome-devtools: a pinned version and Chrome flags); a manifest without one runs its own command
- `SANDBOX_CACHE_DIR` (`/home/node/.cache/mcp` in the image) gives every server `BUN_INSTALL_CACHE_DIR`, `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR` and `npm_config_cache` under it, so a package uvx/npx fetched stays for later starts and other users despite the throwaway HOME. bunx keeps its installs in `/tmp/bunx-<uid>-<pkg>@<version>` anyway
- The build fetches the shipped servers (chrome-devtools-mcp, mcp-server-time) as `node` into those caches, so they start offline; a new manifest's package is fetched on its first start, which needs the npm/PyPI registries reachable (server processes aren't behind the egress proxy)
- Chrome is the Chrome for Testing headless shell at the version chrome-devtools-mcp's Puppeteer pins (`PUPPETEER_REVISIONS` in its bundle): bump `CHROME_DEVTOOLS_MCP_VERSION`, the `chrome-devtools-mcp@<version>` in `overrides.json` and `CHROME_HEADLESS_SHELL_VERSION` together
- Only the libraries the headless shell links are installed; `libgbm.so.1` is copied alone out of its .deb, since its Mesa backends (~190 MB with LLVM) never load for SwiftShader rendering
- amd64 only: Chrome for Testing has no Linux arm64 builds (Debian's `chromium` would be the arm64 route)
- `time` makes no network requests, so the egress proxy doesn't matter for it
- If the one image grows too heavy, an image per server or a container per session fits better than one image with every runtime

## Rules

- Commands only ever come from the sandbox's own manifests (`MARKETPLACE_DIR/mcp`) and `SANDBOX_OVERRIDES`; a request only names the ability
- A child gets PATH, a throwaway HOME (removed when it stops), the cache dirs from `SANDBOX_CACHE_DIR` and its manifest's `env`, nothing else from the sandbox's environment. The caches are shared by every user's servers, which is fine while only the repo's own manifests run
- Chrome only opens `http://` and `https://` (`--allowedUrlPattern` in `overrides.json`): every user's browser runs as the same `node` user, so a `file://` page could read another user's profile under `/tmp`. The allowlist needs Chrome 149+
- Chrome only goes out through the egress proxy (`--proxyServer`, with `--proxy-bypass-list=<-loopback>` so loopback isn't skipped, and WebRTC kept off direct UDP); `--proxyServer`'s port must match `SANDBOX_EGRESS_PORT`. A new stdio server that makes its own requests needs the same, or it isn't covered
- Every new API turn opens a new MCP session; the relay answers later `initialize` calls from the first one, so the server's state (a browser's pages) survives between turns
- Server-to-client requests (sampling, roots, elicitation) get "method not found"; only ping is answered

## Security

Chrome's traffic goes through `src/egress.ts`, which refuses loopback, private, link-local (the cloud metadata service), CGNAT, `0.0.0.0/8`, multicast and reserved addresses (`isPrivateAddress` in `@kaja/shared`), for IP literals and for every address a name resolves to, and then connects to the address it checked, so DNS rebinding can't swap it. Behind that, in `compose.yaml` the sandbox has its own network (only the api joins it), so `db` and `mail` don't resolve, and every port is published on `127.0.0.1` only; production runs it on a separate host. The Node MCP server processes themselves aren't proxied, only their browsers.

## Not yet

- Forwarding users' keys (`auth.in = "env"`) — keyed stdio abilities are refused on both sides
- Per-user limits beyond one process per (user, ability)
- A published image in `.github/workflows/dockerhub.yaml` (production deploys build `apps/sandbox/disco.json` on its own Disco server; see `docs/development/deployment.md`)

## Testing

`bun test apps/sandbox/tests` runs a fixture stdio server (`tests/fixtures/counter-server.ts`) through the real relay; the API's `ability-mcp.test.ts` drives a cloud turn through an in-process sandbox.
