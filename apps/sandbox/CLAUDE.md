# @kaja/sandbox

Runs stdio MCP servers for cloud turns, which can't start commands on the API host, and sends their tool requests out (`fetch_url`, HTTP tools, remote MCP: the API never connects to a tool's host). Anyone can run one (`subztep/kaja-sandbox`): it dials the API's WebSocket (`/sandbox/connect`), registers, and serves the MCP and fetch requests the API tunnels to it; nothing connects in.

The human-facing overview (request flow, warm servers, how the egress proxy works and why `SANDBOX_EGRESS_PORT` must match `overrides.json`) is [README.md](./README.md); keep it in step with changes here.

## How it fits

- Stdio MCP abilities with a `tools` list are always offered in the cloud (`cloudMcpProblem` in `apps/api/src/services/ability.ts`); a cloud turn always gets `mcpSandbox` (`apps/api/src/features/nasi/chat.ts`), so a stdio ability never runs on the API host. nasi's `sandboxedMcpTarget` points each at `SANDBOX_ORIGIN/mcp/<name>`, and requests to that origin go to `mcpSandbox.fetch`
- API side (`apps/api/src/features/sandbox/`): `connect.ts` (owner from `X-Kaja-Sandbox-Key`: `SANDBOX_SYSTEM_KEY` = official, a user's `sandbox_owner` key, none = anonymous; resume by `X-Kaja-Sandbox-Instance`), `tunnel.ts` (fetch ⇄ frames), `registry.ts` (connected tunnels in memory, pseudonyms, `pickSandbox`: last pick → own → shared if the user's `use_shared` and the owner's `share` → official). Rows in `sandbox`/`sandbox_owner` (`services/sandbox.ts`); geolocation in `core/geo.ts`. The API holds the sockets in memory, so it must run as one instance
- A tool request is a `fetch` frame (one hop, redirects back to the API, which checks each): `sendThroughEgress` (`src/egress.ts`) sends it through the egress proxy. `hello` says `fetch: true`; the API's `egressFor` (`registry.ts`) picks only such sandboxes: any the user may for `fetch_url`, and for an ability's requests wherever the key they carry may go (`keyTrust`: none → any, a `--local` client's own (the relay) → their own or the official one, an admin's server-wide one → only the official one)
- Frames are JSON, schemas in `@kaja/schema/api` (`sandboxFrameSchema` from the sandbox, `apiSandboxFrameSchema` from the API). A sandbox sees users only as `pseudonymFor(userId, sandboxId)` (HMAC with a key HKDF-derived from `BETTER_AUTH_SECRET`)
- A `--local` TUI reaches its sandbox-hosted stdio abilities through the API's `/sandbox/relay/mcp/<ability>` (`features/sandbox/relay.ts`): one `mcpSandboxFor` per user, kept until 15 minutes idle, picking by the same rules; a key in `X-Kaja-Ability-Key` counts as the user's own. To the sandbox it's an ordinary `request` frame

## Layout

```
src/cli.ts        # bundle entry: `health` (the Docker HEALTHCHECK), `egress-check <url>` or startSandbox()
src/server.ts     # startSandbox(): banner, env, manifests, the tunnel, status every 15 min, stops every server on SIGTERM/SIGINT
src/health.ts     # status file the tunnel keeps current; `health` reads it
src/tunnel.ts     # connectTunnel: dials KAJA_API_URL, hello/welcome (instance id+secret kept in SANDBOX_STATE_DIR), heartbeat every minute, reconnect with backoff; TunnelServer runs request/fetch/cancel/stats frames
src/hardware.ts   # hello info and heartbeat load
src/capacity.ts   # defaultMaxProcesses (512 MB per server of the memory limit, less 512 MB), hasRoom (512 MB free now)
src/isolation.ts  # UserIsolation: a uid per user (LRU reuse, skipping a uid that still has a process in /proc), asUser: the prlimit + setpriv wrapper
src/pool.ts       # ProcessPool: one relay per (user, ability); idle stop (SANDBOX_IDLE_MS), cap (SANDBOX_MAX_PROCESSES, else from memory): full or short of memory, it stops the least recently used idle server, 503 + x-kaja-sandbox-full only when that doesn't help; memory watchdog (SANDBOX_SERVER_MEMORY)
src/relay.ts      # McpRelay: one stdio child shared by many HTTP sessions; renumbers request ids, initializes the child once
src/stats.ts      # stats frame: pool servers and counts, process-tree RSS from /proc, host + cgroup memory, egress counts
src/egress.ts     # forward proxy on 127.0.0.1:SANDBOX_EGRESS_PORT; a failed connection is a 502 whose reason says why, logged; sendThroughEgress sends fetch frames through it
src/egress-check.ts # `egress-check <url>`: one GET through a fresh egress proxy with this env's WEB_PROXY, step by step
src/manifests.ts  # the stdio manifests it may run, plus overrides.json; proxyEnv sends each server's own requests through the egress proxy
src/report.ts     # Sentry in production (its own project): failed starts, servers that exit on their own, child errors
overrides.json    # the Docker image's command/args per manifest (chrome-devtools: the image's pinned /opt/mcp copy with the Chrome for Testing headless shell, --no-sandbox, http(s) pages only, the egress proxy, a 512 MB JS heap per page)
Dockerfile        # one multi-runtime image (node, bun, uv + python3, Chrome headless shell) running the bundled sandbox
```

## Docker image

- A manifest's `package` goes through nasi's `resolveLaunch` with `self: false`: npm packages run with npx (bun's cache can't be shared between uids), PyPI ones with uvx; nothing here runs docker. One multi-runtime image, so manifests run as on the user's machine: `node:26.12.1-trixie-slim` (chrome-devtools-mcp needs Node 20.19+/22.12+), `bun`/`bunx` copied from the builder stage, `uv`/`uvx` from `ghcr.io/astral-sh/uv` (pinned tag), Debian's `python3` for uvx. No compilers or git yet: add them when a server needs to build from source. If the one image grows too heavy, an image per server or a container per session fits better
- The sandbox itself is one bundled file (`bun build --target=bun`) run by that same `bun`
- An override only changes what the host needs; a manifest without one runs its own command
- `SANDBOX_CACHE_DIR` (`/home/node/.cache/mcp` in the image) gives every server `BUN_INSTALL_CACHE_DIR`, `UV_CACHE_DIR`, `UV_PYTHON_INSTALL_DIR` and `npm_config_cache` under it, so a fetched package stays for later starts and other users despite the throwaway HOME. Except bun's: with per-user uids each server gets its own cache in its HOME, since bunx finds no executable in a cache another uid filled
- The build installs chrome-devtools-mcp into `/opt/mcp` and fetches mcp-server-time into the uv cache (`MCP_SERVER_TIME_VERSION`), so they start offline; a new manifest's package is fetched on its first start, which needs the npm/PyPI registries reachable through the egress proxy
- Chrome is the Chrome for Testing headless shell at the version chrome-devtools-mcp's Puppeteer pins (`PUPPETEER_REVISIONS` in its bundle): bump `CHROME_DEVTOOLS_MCP_VERSION` (the Dockerfile's `npm install --prefix /opt/mcp`) and `CHROME_HEADLESS_SHELL_VERSION` together. Only the libraries the shell links are installed; `libgbm.so.1` is copied alone out of its .deb, since its Mesa backends (~190 MB) never load for SwiftShader rendering. amd64 only: Chrome for Testing has no Linux arm64 builds

## Rules

- Local-only manifests (`localOnly`, or `roots`: they work on the user's own folders) never run here, nor does the API offer them
- Commands only come from the sandbox's own manifests (`MARKETPLACE_DIR/mcp`) and `SANDBOX_OVERRIDES`; a request only names the ability
- A child gets PATH, a throwaway HOME (removed when it stops), the cache dirs, its manifest's `env` and the proxy variables, nothing else from the sandbox's environment (not `KAJA_SANDBOX_KEY`). The caches are shared by every user's servers, which is fine while only the repo's own manifests run
- Each user's servers run as their own uid (`src/isolation.ts`: `prlimit` 512 processes per uid and 4096 files, then `setpriv`, no capabilities, umask 002, uids from 20000, private group, plus the `mcp` group owning `SANDBOX_CACHE_DIR`), only when the sandbox is root (the image) and `SANDBOX_ISOLATE_USERS` is on. HOMEs are `0700` and chowned to the uid
- Chrome only opens `http://` and `https://` (`--allowedUrlPattern` in `overrides.json`, needs Chrome 149+), as a second wall around other users' profiles under `/tmp`
- A keyed stdio server (`auth.in = "env"`): the API's `request` frame brings the key (`mcpSandboxFor`'s `keys`, under the same `keyTrust` as fetches), the manifest says which env var and prefix (`SandboxServer.key`), and the pool starts the (user, ability) server with it, anew when the key changes (a hash on the entry); without one a non-keyless server answers 400. Nothing is written to disk
- A sandbox that isn't the user's own or the official one is borrowed: the API's `McpSandbox.close` (called by `Nasi.close`) sends `release`, and the pool stops that server at once. Abilities with the manifest's `trustedSandbox` never go to a borrowed one (`pickSandbox`'s `trusted`)
- The pool's 503s for a full or short-of-memory sandbox carry `x-kaja-sandbox-full`; `mcpSandboxFor` then picks another (up to 3), and every `head` frame carries `running`, so routing doesn't wait for the heartbeat
- Every new API turn opens a new MCP session; the relay answers later `initialize` calls from the first one, so the server's state (a browser's pages) survives between turns
- Server-to-client requests (sampling, roots, elicitation) get "method not found"; only ping is answered
- Not yet: per-user limits beyond one process per (user, ability)

## Egress and security

All outbound traffic goes through `src/egress.ts`, which refuses loopback, private, link-local (the cloud metadata service), CGNAT, `0.0.0.0/8`, multicast and reserved addresses (`isPrivateAddress` in `@kaja/shared/net`), for IP literals and every address a name resolves to, then connects to the address it checked, so DNS rebinding can't swap it. Only http(s); a refused address throws "Blocked non-public URL", and the decoded body loses `content-encoding`/`content-length`. On a home machine the same rule keeps browsers off the operator's LAN. In `compose.yaml` the sandbox has its own network (only the api joins it), so `db` and `mail` don't resolve and it publishes no port; production runs the official one on a separate host.

- Chrome goes out only through the egress proxy (`--proxyServer`, with `--proxy-bypass-list=<-loopback>` so loopback isn't skipped, WebRTC kept off direct UDP); the port must match `SANDBOX_EGRESS_PORT`. With `WEB_PROXY` set (`http://` only), the proxy tunnels each checked connection through it (`CONNECT <checked-ip>:<port>`, Basic auth from the URL) instead of connecting directly.
- Server processes get the same through env (`proxyEnv` in `src/manifests.ts`, applied after the manifest's `env`): `HTTP(S)_PROXY` at the egress proxy, `NODE_USE_ENV_PROXY=1` (Node ignores them without it), `NO_PROXY` for loopback (chrome-devtools reaches its Chrome there). That's cooperative: Node, Bun, Python, npm and uv follow it, a process that ignores it connects directly; enforcing it would need per-uid iptables (`NET_ADMIN`).

## Release and testing

`.github/workflows/dockerhub.yaml` (`release_sandbox`; Automatic Versioning dispatches it whenever it bumps the sandbox) builds `apps/sandbox/Dockerfile` for amd64 and pushes `subztep/kaja-sandbox:<version>` and `:latest` (repo from `vars.DOCKER_IMAGE_SANDBOX`). The official box deploys from `apps/sandbox/disco.json`.

`.github/workflows/scout.yaml` runs on PRs touching `apps/sandbox` or `packages`: it builds the same Dockerfile (repo root context) into the runner's local image store and hands it to Scout (`local://`; Scout only reads images, and `fs://` would index a lockless SBOM with no base image for `quickview`). It comments a quickview plus the critical and high CVEs, updated on every push. Nothing fails the run over a finding; a fork's PR (no secrets, read-only token) keeps the output in the run summary.

`bun test apps/sandbox/tests` runs a fixture stdio server (`tests/fixtures/counter-server.ts`) through the real relay and the API's `SandboxTunnel`, in-process; the API's `sandbox.test.ts`, `admin-sandbox.test.ts` and `ability-mcp.test.ts` connect real sandboxes over the WebSocket (`tests/integration/sandbox-helpers.ts`).
