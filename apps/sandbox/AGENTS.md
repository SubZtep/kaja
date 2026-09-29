# @kaja/sandbox

Runs stdio MCP servers for cloud turns, which can't start commands on the API host. Anyone can run one (`subztep/kaja-sandbox`): it dials the API's WebSocket (`/sandbox/connect`), registers, and serves the MCP requests the API tunnels to it; nothing connects in.

The human-facing overview (request flow, warm servers, how the egress proxy works and why `SANDBOX_EGRESS_PORT` must match `overrides.json`) is [README.md](./README.md); keep it in step with changes here.

## How it fits

- Keyless stdio MCP abilities with a `tools` list are always offered in the cloud (`cloudMcpProblem` in `apps/api/src/services/ability.ts`); a cloud turn always gets `mcpSandbox` (`apps/api/src/features/nasi/chat.ts`), so a stdio ability never runs on the API host. nasi's `sandboxedMcpTarget` points each at `SANDBOX_ORIGIN/mcp/<name>`, and requests to that origin go to `mcpSandbox.fetch` instead of the guarded fetch
- API side (`apps/api/src/features/sandbox/`): `connect.ts` (owner from `X-Kaja-Sandbox-Key`: `SANDBOX_SYSTEM_KEY` = official, a user's `sandbox_owner` key, none = anonymous; resume by `X-Kaja-Sandbox-Instance`), `tunnel.ts` (fetch ⇄ frames), `registry.ts` (connected tunnels in memory, pseudonyms, `pickSandbox`: last pick → own → shared if the user's `use_shared` and the owner's `share` → official). Rows in `sandbox`/`sandbox_owner` (`services/sandbox.ts`); geolocation in `core/geo.ts`
- Frames are JSON, schemas in `@kaja/schema/api` (`sandboxFrameSchema` from the sandbox, `apiSandboxFrameSchema` from the API). A sandbox sees users only as `pseudonymFor(userId, sandboxId)` (HMAC with a key HKDF-derived from `BETTER_AUTH_SECRET`)
- The API holds the sockets in memory, so it must run as one instance

## Layout

```
src/cli.ts        # bundle entry: `health` (the Docker HEALTHCHECK) or startSandbox()
src/server.ts     # startSandbox(): banner, env, manifests, the tunnel, status every 15 min, stops every server on SIGTERM/SIGINT
src/health.ts     # status file the tunnel keeps current (welcome, heartbeats, disconnects); `health` reads it
src/banner.ts     # the startup banner: the monster, version and setup
src/tunnel.ts     # connectTunnel: dials KAJA_API_URL, hello/welcome (instance id+secret kept in SANDBOX_STATE_DIR), heartbeat every minute, reconnect with backoff; TunnelServer runs request/cancel/stats frames
src/hardware.ts   # hello info (cpu, memory, arch, os, version, cap, abilities) and heartbeat load
src/capacity.ts   # defaultMaxProcesses (512 MB per server of the memory limit, less 512 MB), hasRoom (512 MB free now)
src/isolation.ts  # UserIsolation: a uid per user (LRU reuse), asUser: the prlimit + setpriv wrapper
src/pool.ts       # ProcessPool: one relay per (user, ability); idle stop (SANDBOX_IDLE_MS), cap (SANDBOX_MAX_PROCESSES, else from memory): full or short of memory, it stops the least recently used idle server, 503 + x-kaja-sandbox-full only when that doesn't help; memory watchdog (SANDBOX_SERVER_MEMORY); release
src/relay.ts      # McpRelay: one stdio child shared by many HTTP sessions; renumbers request ids, initializes the child once
src/stats.ts      # stats frame: pool servers and counts, process-tree RSS from /proc, host + cgroup memory, egress counts
src/egress.ts     # forward proxy on 127.0.0.1:SANDBOX_EGRESS_PORT the browsers must use: resolves each host itself, connects only to public addresses (the one it checked)
src/manifests.ts  # the stdio manifests it may run, plus overrides.json
src/report.ts     # Sentry in production (its own project): failed starts, servers that exit on their own (last 20 stderr lines), child errors
overrides.json    # the Docker image's command/args: chrome-devtools (the image's npm-installed /opt/mcp copy, pinned, with the Chrome for Testing headless shell, --no-sandbox, http(s) pages only, the egress proxy, a 512 MB JS heap per page)
Dockerfile        # one multi-runtime image (node, bun, uv + python3, Chrome headless shell) running the bundled sandbox
```

## Docker image

- One multi-runtime image, so manifests run as written, as on the user's machine: `node:22-trixie-slim` (node/npx; chrome-devtools-mcp needs Node 20.19+/22.12+), `bun`/`bunx` copied from the builder stage, `uv`/`uvx` from `ghcr.io/astral-sh/uv` (pinned tag), and Debian's `python3` for uvx. No compilers or git yet: add them when a server needs to build from source
- The sandbox itself is one bundled file (`bun build --target=bun`) run by that same `bun`, so Bun isn't in the image twice
- An override only changes what the host needs (chrome-devtools: a pinned version and Chrome flags); a manifest without one runs its own command
- `SANDBOX_CACHE_DIR` (`/home/node/.cache/mcp` in the image) gives every server `BUN_INSTALL_CACHE_DIR`, `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR` and `npm_config_cache` under it, so a package uvx/npx fetched stays for later starts and other users despite the throwaway HOME. Except bun's: with per-user uids each server gets its own `BUN_INSTALL_CACHE_DIR` in its HOME, since bunx finds no executable in a cache another uid filled (so a bunx server downloads on each start there)
- The build installs chrome-devtools-mcp into `/opt/mcp` and fetches mcp-server-time into the uv cache, so they start offline; a new manifest's package is fetched on its first start, which needs the npm/PyPI registries reachable (server processes aren't behind the egress proxy)
- Chrome is the Chrome for Testing headless shell at the version chrome-devtools-mcp's Puppeteer pins (`PUPPETEER_REVISIONS` in its bundle): bump `CHROME_DEVTOOLS_MCP_VERSION` (the Dockerfile's `npm install --prefix /opt/mcp`) and `CHROME_HEADLESS_SHELL_VERSION` together
- Only the libraries the headless shell links are installed; `libgbm.so.1` is copied alone out of its .deb, since its Mesa backends (~190 MB with LLVM) never load for SwiftShader rendering
- amd64 only: Chrome for Testing has no Linux arm64 builds (Debian's `chromium` would be the arm64 route)
- `time` makes no network requests, so the egress proxy doesn't matter for it
- If the one image grows too heavy, an image per server or a container per session fits better than one image with every runtime

## Rules

- Commands only ever come from the sandbox's own manifests (`MARKETPLACE_DIR/mcp`) and `SANDBOX_OVERRIDES`; a request only names the ability
- A child gets PATH, a throwaway HOME (removed when it stops), the cache dirs from `SANDBOX_CACHE_DIR` and its manifest's `env`, nothing else from the sandbox's environment (not `KAJA_SANDBOX_KEY`). The caches are shared by every user's servers, which is fine while only the repo's own manifests run
- Each user's servers run as their own uid (`src/isolation.ts`: `prlimit` 512 processes per uid and 4096 files, then `setpriv`, no capabilities, umask 002, uids from 20000, private group, plus the `mcp` group owning `SANDBOX_CACHE_DIR`); only when the sandbox is root (the image) and `SANDBOX_ISOLATE_USERS` is on. HOMEs are `0700` and chowned to the uid
- Chrome only opens `http://` and `https://` (`--allowedUrlPattern` in `overrides.json`), as a second wall around other users' profiles under `/tmp`. The allowlist needs Chrome 149+
- Chrome only goes out through the egress proxy (`--proxyServer`, with `--proxy-bypass-list=<-loopback>` so loopback isn't skipped, and WebRTC kept off direct UDP); `--proxyServer`'s port must match `SANDBOX_EGRESS_PORT`. With `WEB_PROXY` set (`http://` only), the egress proxy tunnels each checked connection through it (`CONNECT <checked-ip>:<port>`, Basic auth from the URL) instead of connecting directly. A new stdio server that makes its own requests needs the same, or it isn't covered
- A sandbox that isn't the user's own or the official one is borrowed: the API's `McpSandbox.close` (called by `Nasi.close`) sends `release`, and the pool stops that server at once. Abilities with the manifest's `trustedSandbox` never go to a borrowed one (`pickSandbox`'s `trusted`)
- The pool's 503s for a full or short-of-memory sandbox carry `x-kaja-sandbox-full`; `mcpSandboxFor` then picks another (up to 3), and every `head` frame carries `running`, so routing doesn't wait for the heartbeat
- Every new API turn opens a new MCP session; the relay answers later `initialize` calls from the first one, so the server's state (a browser's pages) survives between turns
- Server-to-client requests (sampling, roots, elicitation) get "method not found"; only ping is answered

## Security

Chrome's traffic goes through `src/egress.ts`, which refuses loopback, private, link-local (the cloud metadata service), CGNAT, `0.0.0.0/8`, multicast and reserved addresses (`isPrivateAddress` in `@kaja/shared/net`), for IP literals and for every address a name resolves to, and then connects to the address it checked, so DNS rebinding can't swap it. Behind that, in `compose.yaml` the sandbox has its own network (only the api joins it), so `db` and `mail` don't resolve and it publishes no port; production runs the official one on a separate host. On a home machine the same rule keeps browsers off the operator's LAN. The Node MCP server processes themselves aren't proxied, only their browsers.

## Not yet

- Forwarding users' keys (`auth.in = "env"`) — keyed stdio abilities are refused on both sides
- Per-user limits beyond one process per (user, ability)

## Release

`.github/workflows/dockerhub.yaml` (`release_sandbox`) builds `apps/sandbox/Dockerfile` for amd64 and pushes `subztep/kaja-sandbox:<apps/sandbox version>` and `:latest` (repo from `vars.DOCKER_IMAGE_SANDBOX`, that by default). The official box still deploys from `apps/sandbox/disco.json`.

## Testing

`bun test apps/sandbox/tests` runs a fixture stdio server (`tests/fixtures/counter-server.ts`) through the real relay and the API's `SandboxTunnel`, wired in-process; the API's `sandbox.test.ts`, `admin-sandbox.test.ts` and `ability-mcp.test.ts` connect real sandboxes over the WebSocket (`tests/integration/sandbox-helpers.ts`).
