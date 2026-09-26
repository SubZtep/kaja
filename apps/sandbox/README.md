# @kaja/sandbox

The MCP sandbox runs **stdio MCP servers for cloud turns**. A stdio server is a program the agent starts and talks to over stdin/stdout, like `chrome-devtools-mcp`. In local mode Kaja starts it on your machine; the cloud API won't start commands on its own host, so it asks the sandbox instead. The sandbox serves each server over Streamable HTTP at `/mcp/<ability>`, and the cloud agent connects to it like any remote MCP server.

It runs **chrome-devtools**, a headless Chrome the assistant can browse with, read pages from and screenshot. It also runs **time** (Python `mcp-server-time`), which tells the current time and converts it between time zones.

## How a cloud turn reaches it

```
 TUI / web / Telegram            API (cloud turn)                     sandbox
┌─────────────────┐   chat   ┌──────────────────────┐  /mcp/chrome-devtools  ┌─────────────────────────────┐
│ "open kaja.io"  │ ───────► │ nasi agent loop      │ ─────────────────────► │ token ok? → user's own      │
└─────────────────┘          │ signs a token:       │  Authorization:        │ chrome-devtools-mcp + Chrome│
                             │ { user, ability,exp }│  Bearer <token>        │ (started on first use)      │
                             └──────────────────────┘                        └─────────────────────────────┘
```

1. The API offers a stdio MCP ability only when it has `SANDBOX_URL` and `SANDBOX_SECRET`, and only a keyless one with a fixed `tools` list.
2. Each turn, the API signs a short-lived token (HMAC-SHA256 over the user id, the ability and an expiry) with the shared `SANDBOX_SECRET`.
3. The sandbox checks the signature, the expiry and that the token is for the ability in the URL, then hands the request to that user's server for that ability.
4. The request only ever *names* an ability. The command that runs comes from the sandbox's own copy of `marketplace/mcp`, with `overrides.json` swapping in this host's flags where needed. The image has node, bun and uv (with Python), so a manifest's `npx`, `bunx` or `uvx` runs as written, and what it fetched stays cached in `SANDBOX_CACHE_DIR` (the shipped servers are fetched when the image is built).

## Auth

Every route but `/health` needs `Authorization: Bearer <token>`. The API signs the token itself; there are no accounts, sessions or API keys on the sandbox.

- **Format:** `<payload>.<signature>`, both base64url. The payload is JSON claims `{ sub, ability, exp }`; the signature is HMAC-SHA256 of the payload with `SANDBOX_SECRET`, which the API and the sandbox share (`signSandboxToken`/`verifySandboxToken` in `@kaja/shared`).
- **Checked:** the signature (constant-time, by WebCrypto), that `exp` (Unix seconds) hasn't passed, and that `ability` fits the route. Anything else is `401`.

| Route | `sub` | `ability` | Lifetime | Signed by |
| --- | --- | --- | --- | --- |
| `/mcp/<ability>` | the user whose server it is | must equal `<ability>` in the URL | 1 hour (a turn) | nasi chat, once per turn and ability |
| `/stats` | the admin asking (for logs) | must be `#stats` (`SANDBOX_STATS_SCOPE`) | 1 minute | `GET /admin/sandbox`, admins only |

No ability can be named `#stats`, so an ability's token can't read the stats, and the stats token opens no MCP server. Tokens can't be revoked one by one; changing `SANDBOX_SECRET` on both sides invalidates them all.

## One warm server per user

- **Started on first use**, one per (user, ability), and **kept warm between turns**: the browser's open pages are still there on your next message. Every turn opens a new MCP session; the relay answers its `initialize` from the first one, so the server itself is only initialized once.
- **Stopped when idle** for `SANDBOX_IDLE_MS` (10 minutes by default). A call that's still running gets one more idle window first.
- **At most `SANDBOX_MAX_PROCESSES`** (8) run at once, across all users. When it's full, the least recently used idle server is stopped to make room. Only when every server is in the middle of a call does a new user get a `503`.
- Each server gets a **throwaway HOME** (removed when it stops) and only `PATH`, the shared package caches (`SANDBOX_CACHE_DIR`) and its manifest's `env`: none of the sandbox's own variables, such as the secret.

## The egress proxy

Chrome will open whatever a page (or the model) points it at. Without a guard, that includes `http://169.254.169.254/` (the cloud metadata service), `http://localhost:3002/` (the sandbox itself) and anything on the host's private network. The API's SSRF checks can't help: the browsing happens here, not in the API.

So the sandbox runs its own small **forward proxy** (`src/egress.ts`), and Chrome is told to send all of its traffic through it:

```
 sandbox container
┌──────────────────────────────────────────────────────────────────────┐
│  sandbox process (Bun)                                               │
│   ├─ :3002             MCP endpoint  ◄──── API                       │
│   └─ 127.0.0.1:3128    egress proxy  ─────────────► public internet  │
│                           ▲                     ✗ 127.x, 10.x,       │
│  chrome-devtools-mcp      │                       169.254.x, ...     │
│   └─ Chrome ──────────────┘ --proxyServer=http://127.0.0.1:3128      │
└──────────────────────────────────────────────────────────────────────┘
```

What happens when Chrome opens `https://example.com`:

1. **Chrome asks the proxy.** It doesn't connect itself; it sends `CONNECT example.com:443` ("open a tunnel for me"). A plain `http://` page comes as `GET http://example.com/path` instead.
2. **The proxy resolves the name itself**, say to `93.184.215.14`.
3. **Every address must be public.** Loopback, private ranges (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, the metadata service), CGNAT, `0.0.0.0/8`, multicast and reserved addresses, and their IPv6 equivalents, are refused with `403`. Chrome shows an error page. The rule is `isPrivateAddress` from `@kaja/shared`, the same one the API's SSRF guard uses.
4. **It connects to the address it checked**, not the name again. That rules out DNS rebinding: a name that answers with a public IP for the check and a private one for the connection.
5. **Bytes are piped both ways.** HTTPS stays encrypted end to end; the proxy never sees inside it. Plain HTTP is rewritten to `GET /path`, and the connection closes after the answer, so the next request (maybe to another host) is checked again.

Two more Chrome flags keep it from going around the proxy:

- `--proxy-bypass-list=<-loopback>`: Chrome normally skips the proxy for `localhost`. That exception is exactly the hole we're closing, so this turns it off.
- `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`: WebRTC could otherwise open direct UDP connections.

Chrome also only opens `http://` and `https://` URLs (`--allowedUrlPattern`). Every user's browser runs as the same `node` user, so a `file://` page could read another user's browser profile.

### The port: `SANDBOX_EGRESS_PORT`

The two ends of the proxy are configured in two places:

| Side | Port comes from |
| --- | --- |
| The proxy listens on | `SANDBOX_EGRESS_PORT` (default `3128`) |
| Chrome connects to | `--proxyServer=http://127.0.0.1:3128` in `overrides.json` |

**They must match.** Change only the env var and the proxy moves while Chrome keeps looking at `3128`: every page then fails to load. That fails safe (nothing leaks), but the browser is broken. A test checks that `overrides.json` matches the env default. The port is internal to the container, so there's normally no reason to change it; if you do, change both.

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

The real image, as production runs it (amd64 only: Chrome for Testing has no Linux arm64 build):

```sh
docker compose up -d sandbox
```

For the API to use it, set the same `SANDBOX_SECRET` on both, and the API's `SANDBOX_URL` (`http://localhost:3002`, or `http://sandbox:3002` inside compose). Deploying to production is covered in [Deployment](../../docs/development/deployment.md#mcp-sandbox).

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `SANDBOX_SECRET` | — (required) | shared with the API; verifies the tokens |
| `PORT` | `3002` | the MCP endpoint and `/health` |
| `MARKETPLACE_DIR` | `../../marketplace` | whose `mcp/*.toml` stdio manifests are the only servers it runs |
| `SANDBOX_OVERRIDES` | — | JSON replacing a manifest's command/args on this host (the image uses `overrides.json`) |
| `SANDBOX_CACHE_DIR` | — | shared bun/uv/npm caches for the servers, so fetched packages stay (the image uses `/home/node/.cache/mcp`) |
| `SANDBOX_IDLE_MS` | `600000` | how long an unused server stays warm |
| `SANDBOX_MAX_PROCESSES` | `8` | most servers at once; each Chrome needs about 300–500 MB of RAM |
| `SANDBOX_EGRESS_PORT` | `3128` | the egress proxy's port; must match `overrides.json` |
| `NODE_ENV` | — | `production` turns on Sentry (the image sets it) |

`.env.example` is generated from `packages/schema/env/sandbox.ts` (`bun generate:env`).

## Observability

- `GET /health` answers `{ "ok": true }` and needs no token.
- `GET /stats` shows what's running right now: every server with its user, state, open calls and sessions, and the memory of its whole process tree (the browser included, read from `/proc`); the host's CPUs, load and memory, and the container's memory limit; and, since the sandbox started, how many servers started, failed to start, stopped idle, stopped for room, crashed, or were refused, plus the egress proxy's open, allowed, refused and failed connections. It needs the stats token (see [Auth](#auth)). The API's admins see it live on the web's **Admin → Dashboard** page, through `GET /admin/sandbox`.
- The logs have a line for every server started, stopped when idle or stopped to make room, and every "sandbox is full" refusal, each with the running count.
- In production, servers that won't start, exit on their own or error go to the sandbox's own Sentry project with their last 20 stderr lines. Request headers (which carry the token) are dropped.

## Not yet

- Abilities that need the user's key (`auth.in = "env"`): keys aren't forwarded, so keyed stdio abilities are refused on both sides.
- Per-user limits beyond one server per (user, ability).
- Servers that build from source: the image has no compilers or git yet.

## Code

| File | Role |
| --- | --- |
| `src/server.ts` | entry: starts the egress proxy, loads manifests, serves, stops everything on SIGTERM/SIGINT |
| `src/app.ts` | Hono routes: `/health`, `/stats` and `/mcp/:ability`, the last two behind the token |
| `src/pool.ts` | one server per (user, ability): idle stop, cap, making room |
| `src/relay.ts` | shares one stdio child between many HTTP sessions, renumbering request ids |
| `src/egress.ts` | the egress proxy |
| `src/stats.ts` | `/stats`: the pool's servers and counts, memory per process tree, host and container memory |
| `src/manifests.ts` | the stdio manifests it may run, plus the overrides |
| `src/report.ts` | Sentry in production |
| `overrides.json` | the image's command and Chrome flags for chrome-devtools |
| `Dockerfile` | one multi-runtime image (Node 22 slim, bun, uv with Python, Chrome for Testing's headless shell) running the bundled sandbox |

Tests: `bun test apps/sandbox/tests`. More notes for coding agents are in [AGENTS.md](./AGENTS.md).
