# @kaja/sandbox

The MCP sandbox runs **stdio MCP servers for cloud turns**. A stdio server is a program the agent starts and talks to over stdin/stdout, like `chrome-devtools-mcp`. In local mode Kaja starts it on your machine; the cloud API won't start commands on its own host, so it asks a sandbox instead.

Anyone can run one: it **dials out** to the API over a WebSocket, so it needs no open port and works behind home NAT. The API tunnels each MCP request (Streamable HTTP, SSE included) over that socket.

It runs **chrome-devtools**, a headless Chrome the assistant can browse with, read pages from and screenshot. It also runs **time** (Python `mcp-server-time`), which tells the current time and converts it between time zones.

## Run one

```sh
# linked to your account (key from the web app's Sandbox page)
docker run -d --restart unless-stopped --memory 4g --cpus 2 --shm-size 1g -v kaja-sandbox:/data -e KAJA_SANDBOX_KEY=ks_… subztep/kaja-sandbox
# anonymous: shared with everyone
docker run -d --restart unless-stopped --memory 4g --cpus 2 --shm-size 1g -v kaja-sandbox:/data subztep/kaja-sandbox
```

The `/data` volume keeps its registration, so a restart comes back as the same sandbox. `SANDBOX_NAME` names it. `--memory` and `--cpus` are how much of the machine it lends: it runs one server (browser) per 512 MB of its memory limit, less 512 MB for itself, so 7 with `--memory 4g`; `SANDBOX_MAX_PROCESSES` overrides that.

## How a cloud turn reaches it

```
 TUI / web / Telegram       API (cloud turn)                          sandbox (anywhere)
┌────────────────┐  chat  ┌───────────────────────────┐  WebSocket  ┌─────────────────────────────┐
│ "open kaja.io" │ ─────► │ nasi agent loop           │ ◄────────── │ dialled in at start:        │
└────────────────┘        │ picks a sandbox, sends    │  request    │ hello {cpu, memory, ...}    │
                          │ { user: pseudonym,        │ ──────────► │ → user's own                │
                          │   ability, HTTP request } │ ◄────────── │ chrome-devtools-mcp + Chrome│
                          └───────────────────────────┘  head/chunks└─────────────────────────────┘
```

1. At start the sandbox connects to `KAJA_API_URL`'s `/sandbox/connect` with its owner's key (`X-Kaja-Sandbox-Key`; none: anonymous) and, after the first time, the id and secret it was welcomed with (`X-Kaja-Sandbox-Instance`). It says `hello` with its hardware, version, cap and abilities; the API records it, with its public IP's location from the geolocation service, and answers `welcome`. Every minute it sends a `heartbeat` with its load.
2. A cloud turn picks a sandbox per ability: the one the user's last turn used while it still fits, else their own, else (only if they allow it) one another user shares or an anonymous one, nearest first, else the official one. See `apps/api/src/features/sandbox/registry.ts`.
3. The API sends the MCP request as a `request` frame; the sandbox runs it and streams the answer back as `head`, `chunk`… and `end` frames (`cancel` stops it). Frames are JSON and checked against `sandboxFrameSchema`/`apiSandboxFrameSchema` in `@kaja/schema/api` on both sides.
4. The request only ever *names* an ability and a user **pseudonym** (an HMAC of the user and the sandbox): an operator never learns who's using their sandbox. The command that runs comes from the sandbox's own copy of `marketplace/mcp`, with `overrides.json` swapping in this host's flags where needed. The image has node, bun and uv (with Python), so a manifest's `npx`, `bunx` or `uvx` runs as written, and what npx and uvx fetched stays cached in `SANDBOX_CACHE_DIR` (chrome-devtools-mcp is installed in the image, and the time server fetched when it's built).

## Trust

The operator of a sandbox can see everything that runs on it: the pages its browsers open, what's typed into them. So a user's turns only run in other people's sandboxes when they switch **Use shared sandboxes** on; their own and the official one are always fine. Owners share theirs by default (**Share my sandboxes**). Users' ability keys are never sent to any sandbox, so keyed stdio abilities stay local-only. When a turn borrowed someone else's sandbox, the API sends `release` as it ends and the user's server stops at once, so no browser profile (cookies, logins) waits there for the operator; and the model is told not to sign in or type personal data when shared sandboxes are on. A manifest with `trustedSandbox = true` never runs in a shared one at all.

## One Linux user per user

In the image the sandbox runs as root, only so it can start every user's servers as **their own Linux user**: a uid from 20000 up (with a private group of the same number), kept for that user while the sandbox runs. `src/isolation.ts` starts each server through util-linux's `prlimit` (at most 512 processes and threads per uid, 4096 open files) and `setpriv` with that uid, every capability dropped for good (`--inh-caps=-all --bounding-set=-all --no-new-privs`) and umask `002`. The server's throwaway HOME is `0700` and owned by that uid, and so is Chrome's profile under `/tmp`, so one user's browser can't read another's cookies or pages. The only thing they share is the package caches (`SANDBOX_CACHE_DIR`), through the `mcp` group (gid 1500), group-writable. Outside the image (not root) or with `SANDBOX_ISOLATE_USERS=false`, every server runs as the sandbox's own user.

This keeps users apart from each other. It doesn't keep anything from the operator, who is root on their own machine.

## One warm server per user

- **Started on first use**, one per (user, ability), and **kept warm between turns**: the browser's open pages are still there on your next message. Every turn opens a new MCP session; the relay answers its `initialize` from the first one, so the server itself is only initialized once.
- **Stopped when idle** for `SANDBOX_IDLE_MS` (10 minutes by default). A call that's still running gets one more idle window first.
- **At most `SANDBOX_MAX_PROCESSES`** run at once, across all users: unset, one per 512 MB of the container's memory limit (else the machine's RAM), less 512 MB. When it's full, the least recently used idle server is stopped to make room. A new server also needs 512 MB free at that moment (the same idle server is stopped for it). Only when every server is in the middle of a call, or memory stays short, does a new user get a `503` marked `x-kaja-sandbox-full`, and the API tries their next sandbox.
- **Stopped over its memory**: every 30 s the pool measures each server's whole process tree, and one above `SANDBOX_SERVER_MEMORY` (1 GB) is stopped, even mid-call, so one user's browser can't take the whole sandbox.
- **Stopped when a borrowed turn ends** (`release`), on a sandbox that isn't the user's own or the official one.
- Each server gets a **throwaway HOME** (removed when it stops) and only `PATH`, the shared package caches (`SANDBOX_CACHE_DIR`) and its manifest's `env`: none of the sandbox's own variables, such as its key.

## The egress proxy

Chrome will open whatever a page (or the model) points it at. Without a guard, that includes `http://169.254.169.254/` (the cloud metadata service), the operator's router and anything else on the host's private network. The API's SSRF checks can't help: the browsing happens here, not in the API.

So the sandbox runs its own small **forward proxy** (`src/egress.ts`), and Chrome is told to send all of its traffic through it:

```
 sandbox container
┌──────────────────────────────────────────────────────────────────────┐
│  sandbox process (Bun)                                               │
│   ├─ WebSocket ──────────────────────────────────► API               │
│   └─ 127.0.0.1:3128    egress proxy  ─────────────► public internet  │
│                           ▲                     ✗ 127.x, 10.x,       │
│  chrome-devtools-mcp      │                       169.254.x, ...     │
│   └─ Chrome ──────────────┘ --proxyServer=http://127.0.0.1:3128      │
└──────────────────────────────────────────────────────────────────────┘
```

What happens when Chrome opens `https://example.com`:

1. **Chrome asks the proxy.** It doesn't connect itself; it sends `CONNECT example.com:443` ("open a tunnel for me"). A plain `http://` page comes as `GET http://example.com/path` instead.
2. **The proxy resolves the name itself**, say to `93.184.215.14`.
3. **Every address must be public.** Loopback, private ranges (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, the metadata service), CGNAT, `0.0.0.0/8`, multicast and reserved addresses, and their IPv6 equivalents, are refused with `403`. Chrome shows an error page. The rule is `isPrivateAddress` from `@kaja/shared/net`, the same one the API's SSRF guard uses.
4. **It connects to the address it checked**, not the name again. That rules out DNS rebinding: a name that answers with a public IP for the check and a private one for the connection.
5. **Bytes are piped both ways.** HTTPS stays encrypted end to end; the proxy never sees inside it. Plain HTTP is rewritten to `GET /path`, and the connection closes after the answer, so the next request (maybe to another host) is checked again.

Two more Chrome flags keep it from going around the proxy:

- `--proxy-bypass-list=<-loopback>`: Chrome normally skips the proxy for `localhost`. That exception is exactly the hole we're closing, so this turns it off.
- `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`: WebRTC could otherwise open direct UDP connections.

Chrome also only opens `http://` and `https://` URLs (`--allowedUrlPattern`), so a page can't read files on the machine at all.

### The port: `SANDBOX_EGRESS_PORT`

The two ends of the proxy are configured in two places:

| Side | Port comes from |
| --- | --- |
| The proxy listens on | `SANDBOX_EGRESS_PORT` (default `3128`) |
| Chrome connects to | `--proxyServer=http://127.0.0.1:3128` in `overrides.json` |

**They must match.** Change only the env var and the proxy moves while Chrome keeps looking at `3128`: every page then fails to load. That fails safe (nothing leaks), but the browser is broken. A test checks that `overrides.json` matches the env default. The port is internal to the container, so there's normally no reason to change it; if you do, change both.

### Going out through `WEB_PROXY`

Set `WEB_PROXY` (an `http://` proxy URL, credentials allowed: `http://user:pass@proxy.example.com:8080`) and the egress proxy stops connecting directly. After the same checks, it opens a `CONNECT` tunnel through `WEB_PROXY` to **the address it checked** (not the name, so the upstream can't resolve it to something else), with the credentials as `Proxy-Authorization: Basic …`. HTTPS rides that tunnel as before; plain HTTP is sent inside it in origin form, so the site still gets its `Host` header. If the upstream doesn't answer `200`, Chrome gets a `502` and the stats count it as failed.

Chrome can't point at `WEB_PROXY` itself: it has no way to take proxy credentials from a flag, and it would skip the private-address checks. The upstream must allow `CONNECT` to IP addresses on any port (commercial proxies do; Squid by default only allows `443`, which leaves plain `http://` pages failing).

### What the proxy doesn't cover

- Only the browsers go through it. The MCP server processes themselves (Node) connect directly. A new stdio server that makes its own requests needs its own guard.
- It limits *where* Chrome connects, not *what* it does there: any public site is fair game, like in a normal browser.

That's why production also runs the sandbox on a **separate server** with nothing else on it, and why in `compose.yaml` it has its own network with only the API on it.

## Running it

Locally, with hot reload (uses your own `bunx chrome-devtools-mcp` and Chrome, **without** the image's overrides, so the egress proxy starts but Chrome doesn't use it):

```sh
bun dev:sandbox
```

`chrome-devtools-mcp` looks for Google Chrome stable (`/opt/google/chrome/chrome` on Linux). With another build, such as a distro's Chromium, point it there with an overrides file outside the repo, and name that file in `apps/sandbox/.env` as `SANDBOX_OVERRIDES=/path/to/sandbox-overrides.json`, then restart the sandbox:

```json
{
  "chrome-devtools": {
    "command": "bunx",
    "args": ["chrome-devtools-mcp@latest", "--headless", "--isolated", "--executablePath=/usr/bin/chromium"]
  }
}
```

Outside the image `KAJA_API_URL` defaults to the local API (`http://localhost:3001`), and without `KAJA_SANDBOX_KEY` it joins anonymously. Set the API's `SANDBOX_SYSTEM_KEY` and the same value as `KAJA_SANDBOX_KEY` to make it the official one.

The real image, as production runs it (amd64 only: Chrome for Testing has no Linux arm64 build), joins the compose API as the official sandbox:

```sh
docker compose up -d sandbox
```

Deploying to production is covered in [Deployment](https://docs.kaja.io/development/deployment#mcp-sandbox).

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `KAJA_API_URL` | `https://api.kaja.io` in the image, else `http://localhost:3001` | the API it dials |
| `KAJA_SANDBOX_KEY` | — | your key from the web's Sandbox page (or the API's `SANDBOX_SYSTEM_KEY`); unset: anonymous |
| `SANDBOX_NAME` | — | a name shown for it |
| `SANDBOX_STATE_DIR` | `./.sandbox` (`/data` in the image) | where it keeps the id and secret it was welcomed with |
| `MARKETPLACE_DIR` | `../../marketplace` | whose `mcp/*.toml` stdio manifests are the only servers it runs |
| `SANDBOX_OVERRIDES` | — | JSON replacing a manifest's command/args on this host (the image uses `overrides.json`) |
| `SANDBOX_CACHE_DIR` | — | shared bun/uv/npm caches for the servers, so fetched packages stay (the image uses `/home/node/.cache/mcp`) |
| `SANDBOX_IDLE_MS` | `600000` | how long an unused server stays warm |
| `SANDBOX_MAX_PROCESSES` | from memory | most servers at once; unset, one per 512 MB of the memory limit, less 512 MB |
| `SANDBOX_SERVER_MEMORY` | `1073741824` | bytes one server (a browser with all its processes) may use before it's stopped |
| `SANDBOX_ISOLATE_USERS` | `true` | each user's servers as their own Linux user (only when running as root) |
| `SANDBOX_EGRESS_PORT` | `3128` | the egress proxy's port; must match `overrides.json` |
| `WEB_PROXY` | — | `http://` proxy the egress proxy tunnels checked traffic through; unset connects directly |
| `NODE_ENV` | — | `production` turns on Sentry (the image sets it) |

`.env.example` is generated from `packages/schema/env/sandbox.ts` (`bun generate:env`).

## Observability

- The API's `sandbox` table has every sandbox that ever connected: owner, online, when last seen, IP and its full geolocation, the `hello` info and the latest `heartbeat`; every heartbeat is also a row in `sandbox_sample` (kept 7 days), which the admin dashboard charts over the last day.
- Asked over the socket, the sandbox reports what's running right now: every server with its (pseudonymous) user, state, open calls and sessions, and the memory of its whole process tree (the browser included, read from `/proc`); the host's CPUs, load and memory, and the container's memory limit; and, since the sandbox started, how many servers started, failed to start, stopped idle, stopped for room, stopped over memory, were released, crashed, or were refused (full or short of memory), plus the egress proxy's open, allowed, refused and failed connections. The API's admins see every sandbox live on the web's **Admin → Dashboard** page, through `GET /admin/sandbox`, with the users' emails.
- The logs have a line for connecting and losing the API, every server started, stopped when idle, to make room, over its memory or released, and every "sandbox is full" or short-of-memory refusal, each with the running count.
- In production, servers that won't start, exit on their own or error go to the sandbox's own Sentry project with their last 20 stderr lines.

## Not yet

- Abilities that need the user's key (`auth.in = "env"`): keys aren't forwarded, so keyed stdio abilities are refused on both sides.
- Per-user limits beyond one server per (user, ability) (CPU, memory per uid).
- Servers that build from source: the image has no compilers or git yet.

## Code

| File | Role |
| --- | --- |
| `src/server.ts` | entry: starts the egress proxy, loads manifests, connects the tunnel, stops everything on SIGTERM/SIGINT |
| `src/tunnel.ts` | the dial-out WebSocket: hello, heartbeats, reconnects, and running the API's request frames |
| `src/hardware.ts` | the hello's hardware facts and the heartbeat's load |
| `src/pool.ts` | one server per (user, ability): idle stop, cap, making room, memory watchdog, release |
| `src/capacity.ts` | the default cap from memory, and the live free-memory check |
| `src/isolation.ts` | a Linux uid per user, and the `prlimit` + `setpriv` wrapper that starts a server as it |
| `src/relay.ts` | shares one stdio child between many HTTP sessions, renumbering request ids |
| `src/egress.ts` | the egress proxy |
| `src/stats.ts` | the stats: the pool's servers and counts, memory per process tree, host and container memory |
| `src/manifests.ts` | the stdio manifests it may run, plus the overrides |
| `src/report.ts` | Sentry in production |
| `overrides.json` | the image's command and Chrome flags for chrome-devtools |
| `Dockerfile` | one multi-runtime image (Node 22 slim, bun, uv with Python, Chrome for Testing's headless shell) running the bundled sandbox |

Tests: `bun test apps/sandbox/tests`. More notes for coding agents are in [AGENTS.md](./AGENTS.md).
