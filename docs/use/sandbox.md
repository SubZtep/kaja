---
layout: page
title: Sandbox
parent: Using Kaja
nav_order: 6
summary: Run a sandbox of your own, and how cloud tools reach it.
icon: 📦
---

# Sandbox

A sandbox runs **stdio MCP servers for cloud turns**. A stdio server is a program the agent starts and talks
to over stdin and stdout, like `chrome-devtools`. In local mode Kaja starts that program on your machine. The
cloud API does not start commands on its own host, so it asks a sandbox instead.

Anyone can run one. It **dials out** to the API over a WebSocket, so it needs no open port and works behind
home NAT. The API tunnels each MCP request, including server-sent events, over that socket.

It runs **chrome-devtools**, a headless Chrome the assistant can browse with, read pages from and screenshot.
It also runs **time** (Python `mcp-server-time`), which tells the current time and converts it between time
zones.

It also sends a cloud turn's **tool requests** out. `fetch_url`, HTTP tools and remote MCP servers connect
from the sandbox, through its [egress proxy](#the-egress-proxy).

What a cloud chat uses one for is in [MCP servers](/abilities/mcp#in-the-cloud). This page is how to run one,
and what it does with the traffic it is given.

## Run one

The same commands are on the web app's Sandbox page. Linked to your account, with the key from that page:

```sh
docker run -d --name kaja-sandbox --restart unless-stopped --shm-size 1g -v kaja-sandbox:/data -e KAJA_SANDBOX_KEY=ks_… subztep/kaja-sandbox
```

Anonymous, shared with everyone, and lending at most 4 GB and 2 CPUs:

```sh
docker run -d --name kaja-sandbox --restart unless-stopped --memory 4g --cpus 2 --shm-size 1g -v kaja-sandbox:/data subztep/kaja-sandbox
```

The `/data` volume keeps its registration, so a restart comes back as the same sandbox. `SANDBOX_NAME` names
it. `--memory` and `--cpus` are optional. The web app's commands add them behind a **Limit what it may use**
switch, and they cap how much of the machine it lends. It runs one server (one browser) per 512 MB of its
memory limit, or of the machine's RAM when there is no limit, less 512 MB for itself. That is 7 servers with
`--memory 4g`. It turns new ones away while less than 512 MB is free. `SANDBOX_MAX_PROCESSES` overrides the
count.

## Is it working?

It starts with the Kaja monster and a summary (API, owner, servers, capacity), then logs
`Sandbox connected to … as <id>` and `Sandbox ready`. After that it is quiet until someone uses it. Each MCP
server it starts or stops is logged, plus a status line every 15 minutes. The image's health check
(`bun sandbox.js health`) reports healthy while it is connected and has sent a heartbeat in the last 150
seconds, so Docker shows it as healthy or unhealthy.

## How a cloud turn reaches it

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart LR
  Chat["TUI, web or Telegram"] -->|chat| API["API"]
  API -->|"request"| Sandbox["sandbox"]
  Sandbox -->|"head, chunks"| API
  API <-->|"WebSocket, dialled out at start"| Sandbox
```

1. At start the sandbox connects to `KAJA_API_URL`'s `/sandbox/connect` with its owner's key. With no key it
   joins anonymously. After the first time it also sends the id and secret it was welcomed with. It says
   hello with its hardware, version, cap and abilities. The API records it, including the location its public
   IP maps to, and answers welcome. Every minute it sends a heartbeat with its load.
2. A cloud turn picks a sandbox per ability: the one that user's last turn used, while it still fits, else
   their own, else (only if they allow it) one another user shares or an anonymous one, nearest first, else
   Kaja's own.
3. The API sends the MCP request as one frame. The sandbox runs it and streams the answer back as a head,
   then chunks, then an end. A cancel stops it. Both sides check that each frame is one they know.
4. A tool request (`fetch_url`, an HTTP tool's call, a remote MCP server's traffic) comes as a fetch frame
   instead: one hop, which the sandbox sends out through its egress proxy and streams back the same way.
   Redirects come back to the API, which checks each one. A sandbox that accepts them says so in its hello.
   An older image gets none. `fetch_url` may use any sandbox the user may use. An ability's requests go
   wherever the key they carry may (see [Trust](#trust)).
5. The request only ever names an ability and a user **pseudonym** (derived from the user and the sandbox),
   so an operator does not learn who is using their sandbox. The command that runs comes from the sandbox's
   own copy of the marketplace (`abilities/<name>/mcp.toml`). `overrides.json` swaps in this host's flags
   where needed. The image has Node, Bun and uv (with Python), so a manifest's `npx`, `bunx` or `uvx` runs
   as written. What `npx` and `uvx` fetched stays cached in `SANDBOX_CACHE_DIR`. chrome-devtools is installed
   in the image, and the time server is fetched when the image is built.

## Trust

> Whoever runs a sandbox can see everything that runs on it: the pages its browser opens, and what is typed
> into them.
> {: .warning }

A user's turns run in other people's sandboxes only when they switch **Use shared sandboxes** on. Their own
sandbox and Kaja's are always available. Owners share theirs by default (**Share my sandboxes**).

Keys follow one rule, for an HTTP tool's or remote MCP server's requests and for a keyed stdio server alike:

- a call without a key may go to any sandbox the user may use;
- one with the server's key (the same key for every user; users have none of their own in the cloud) only to
  Kaja's sandbox;
- one with a `--local` client's own key, through the API's relay, only to the user's own sandbox or Kaja's.

A key travels with each request and is never written to disk. A keyed stdio server gets it in the environment
variable its manifest names, and starts anew when the key changes. When a turn borrowed someone else's
sandbox, the API releases it as the turn ends and that user's server stops at once, so no browser profile
(cookies, logins) waits there. The model is told not to send personal data through a tool that runs elsewhere
while shared sandboxes are on.

A manifest with `trustedSandbox = true` never runs in a shared sandbox. chrome-devtools is one, so a browser
only ever runs in its user's own sandbox or Kaja's.

## One Linux user per user

In the image the sandbox runs as root only so it can start each user's servers as **their own Linux user**:
a uid from 20000 up, with a private group of the same number, kept for that user while the sandbox runs.
Once all 10 000 are taken, the least recently used uid that no process still runs as is reused, so a new
user cannot inherit a live browser profile.

Each server starts with at most 512 processes and threads, 4096 open files, every capability dropped, and
umask `002`. Its throwaway home directory is private to that uid, and so is Chrome's profile, so one user's
browser cannot read another's cookies or pages. The only thing users share is the package caches
(`SANDBOX_CACHE_DIR`), through a common group.

Outside the image (where it is not root), or with `SANDBOX_ISOLATE_USERS=false`, every server runs as the
sandbox's own user.

This keeps users apart from each other. It does not hide anything from the operator, who is root on their
own machine.

## One warm server per user

- **Started on first use**, one per user and ability, and **kept warm between turns**. The browser's open
  pages are still there on the next message. Every turn opens a new MCP session. The relay answers its
  `initialize` from the first one, so the server itself is only initialized once.
- **Stopped when idle** for `SANDBOX_IDLE_MS` (10 minutes by default). A call that is still running gets one
  more idle window first.
- **At most `SANDBOX_MAX_PROCESSES`** run at once, across all users. When that is unset, the cap is one per
  512 MB of the container's memory limit (else the machine's RAM), less 512 MB. When it is full, the least
  recently used idle server is stopped to make room. A new server also needs 512 MB free at that moment. Only
  when every server is in the middle of a call, or memory stays short, does a new user get a `503` marked
  `x-kaja-sandbox-full`, and the API tries their next sandbox.
- **Stopped over its memory.** Every 30 seconds the pool measures each server's whole process tree. One above
  `SANDBOX_SERVER_MEMORY` (1 GB) is stopped, even mid-call, so one user's browser cannot take the whole
  sandbox.
- **Stopped when a borrowed turn ends**, on a sandbox that is neither the user's own nor Kaja's.
- Each server gets a **throwaway home** (removed when it stops) and only `PATH`, the shared package caches
  and its manifest's own environment. None of the sandbox's own variables, such as its key, are passed in.

## The egress proxy

Chrome will open whatever a page, or the model, points it at. Without a guard, that includes the cloud
metadata address `http://169.254.169.254/`, the operator's router, and anything else on the host's private
network. The API's own checks cannot help: the browsing happens here, not in the API.

So the sandbox runs its own small **forward proxy**, and Chrome is told to send all of its traffic through
it. The tool requests the API sends go through it too, so a `fetch_url` gets exactly the browser's checks.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart TB
  API["API"] <-->|WebSocket| Proc["sandbox process"]
  Proc --> Proxy["egress proxy<br>127.0.0.1:3128"]
  Chrome["Chrome"] -->|all of its traffic| Proxy
  Proxy --> Net["public internet"]
  Proxy -.-> Priv["private, loopback and link-local addresses: refused"]
```

What happens when Chrome opens `https://example.com`:

1. **Chrome asks the proxy.** It sends `CONNECT example.com:443` to open a tunnel. A plain `http://` page
   comes as `GET http://example.com/path` instead.
2. **The proxy resolves the name itself**, say to `93.184.215.14`.
3. **Every address must be public.** Loopback, private ranges (`10/8`, `172.16/12`, `192.168/16`),
   link-local (`169.254/16`, the metadata service), CGNAT, `0.0.0.0/8`, multicast and reserved addresses,
   and their IPv6 equivalents, are refused. Chrome shows an error page. The rule is the same one the API
   uses for its own outbound checks.
4. **It connects to the address it checked**, not the name again. That rules out DNS rebinding: a name that
   answers with a public address for the check and a private one for the connection.
5. **Bytes are piped both ways.** HTTPS stays encrypted end to end. The proxy never sees inside it. Plain
   HTTP is rewritten to `GET /path`, and the connection closes after the answer, so the next request (maybe
   to another host) is checked again.

Two more Chrome flags keep it from going around the proxy:

- `--proxy-bypass-list=<-loopback>` turns off Chrome's usual exception for `localhost`.
- `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` stops WebRTC opening direct UDP connections.

Chrome also only opens `http://` and `https://` URLs, so a page cannot read files on the machine.

The MCP server processes go through the proxy too, for their own requests (a server that fetches a URL the
model gave it, or `npx` / `uvx` downloading a package). Each one starts with `HTTP_PROXY` and `HTTPS_PROXY`,
and the lowercase pair, pointing at the proxy, plus `NODE_USE_ENV_PROXY=1`, which Node needs before it
follows them. Node, Bun, Python, npm and uv honour these. A manifest's own environment cannot override them.
`NO_PROXY` keeps loopback direct, since chrome-devtools talks to its own Chrome there.

### The port

The proxy listens on `SANDBOX_EGRESS_PORT` (default `3128`). Chrome connects to
`--proxyServer=http://127.0.0.1:3128`, set in `overrides.json`. **The two must match.** Change only the
environment variable and the proxy moves while Chrome keeps looking at `3128`: every page then fails to
load. That fails closed (nothing leaks), and the browser is broken. The port is internal to the container,
so there is normally no reason to change it. If you do, change both.

### Going out through `WEB_PROXY`

Set `WEB_PROXY` to an `http://` proxy URL. Credentials are allowed:
`http://user:pass@proxy.example.com:8080`. The egress proxy stops connecting directly. After the same
checks, it opens a `CONNECT` tunnel through `WEB_PROXY` to **the address it checked** (not the name, so the
upstream cannot resolve it to something else), with the credentials as `Proxy-Authorization`. HTTPS rides
that tunnel as before. Plain HTTP is sent inside it so the site still gets its `Host` header.

If the upstream does not answer `200`, or cannot be reached, Chrome gets a `502` whose reason says why
(`Bad Gateway: WEB_PROXY answered HTTP/1.1 407 …`). The sandbox logs `Egress couldn't connect`, and the
stats count it as failed. A tool request fails with the same reason (`Couldn't connect to <host>: …`), which
is what the chat shows.

Chrome cannot point at `WEB_PROXY` itself: it has no way to take proxy credentials from a flag, and it would
skip the private-address checks. The upstream must allow `CONNECT` to IP addresses on any port. Commercial
proxies do. Squid, by default, only allows `443`, which leaves plain `http://` pages failing.

### Checking the egress

When a browser page or a tool request fails, `egress-check` sends one `GET` through a fresh egress proxy
with the sandbox's own environment, so you see the same path the real traffic takes, step by step. It starts
its own proxy on a free port, so it runs beside a live sandbox without touching it.

```sh
bun sandbox.js egress-check <url>                                              # inside the container
docker exec <container> bun sandbox.js egress-check <url>                      # a running container
disco run --project kaja-sandbox --service worker "bun sandbox.js egress-check <url>"  # Kaja's own sandbox
bun apps/sandbox/src/cli.ts egress-check <url>                                 # a checkout, with your shell's env
```

Quote a URL with a query string (`'https://…?q=test'`), or the shell takes the `?`. Each line is one step:

| Line        | What it says                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `WEB_PROXY` | the upstream proxy without its password (`(with credentials)` when it has some), or `unset, connecting directly` |
| `Resolve`   | what the name resolved to here, and whether every address is public; a private one is refused                    |
| `Request`   | the status, content type and size of the answer, or `failed:` and the reason a tool request would show           |
| `CONNECT`   | only when `WEB_PROXY` refused the tunnel: its answer for the checked IP and for the name                         |

Any HTTP answer means the path works, whatever the status: it came from the site. A healthy run against
Brave's API, which answers `422` to a request with no key:

```
WEB_PROXY  http://proxy.example.com:8080 (with credentials)
Resolve    api.search.brave.com → 3.33.153.106, 15.197.138.111 (public)
Request    422  (application/json, 233 bytes)
```

It does not follow redirects (tool requests do not either; the API checks each hop), so a site's bare root
often shows a `301`. Check the endpoint the tool calls instead. When `Request` fails:

- `Blocked non-public URL`: the name resolves to a private address, or does not resolve at all (the
  `Resolve` line says which). The sandbox connects to neither.
- `Couldn't connect to <host>: WEB_PROXY answered HTTP/1.1 407 …`: wrong or missing proxy credentials.
- `Couldn't connect to <host>: WEB_PROXY answered …`, with the `CONNECT` lines showing the IP refused and
  the name `200`: the upstream will not `CONNECT` to IP addresses, which the egress proxy needs.
- `Couldn't connect to <host>: no answer in 10 s`, `ECONNREFUSED`, or `WEB_PROXY closed without an answer`:
  `WEB_PROXY` (or, without one, the site) cannot be reached from this host.

It exits `0` when an answer came back, `1` when the request failed, and `2` on a missing or non-http(s) URL.

### What the proxy does not cover

For the server processes the proxy variables are a request, not a wall. A program that ignores them, or
opens raw sockets, still connects directly, and so can anything on loopback. Every server here comes from
the repo's own manifests, so this covers a careless server. Walling one in for real needs per-user firewall
rules, which take `--cap-add NET_ADMIN`.

With `WEB_PROXY` set, the servers' package downloads (a new manifest's first start) go through it too, so
they count towards its traffic.

The proxy limits _where_ Chrome connects, not _what_ it does there. Any public site is allowed, as in a
normal browser.

Kaja's own sandbox runs on a **separate server** with nothing else on it. In `compose.yaml` the sandbox has
its own network, and only the API joins it.

## From a checkout

Locally, with hot reload. This uses your own `bunx chrome-devtools-mcp` and Chrome, **without** the image's
overrides, so the egress proxy starts but Chrome does not use it:

```sh
bun dev:sandbox
```

`chrome-devtools-mcp` looks for Google Chrome stable (`/opt/google/chrome/chrome` on Linux). With another
build, such as a distro's Chromium, point it there with an overrides file outside the repo, and name that
file in `apps/sandbox/.env` as `SANDBOX_OVERRIDES=/path/to/sandbox-overrides.json`, then restart:

```json
{
  "chrome-devtools": {
    "command": "bunx",
    "args": [
      "chrome-devtools-mcp@latest",
      "--headless",
      "--isolated",
      "--executablePath=/usr/bin/chromium"
    ]
  }
}
```

Outside the image, `KAJA_API_URL` defaults to the local API (`http://localhost:3001`). Without
`KAJA_SANDBOX_KEY` it joins anonymously. Set the API's `SANDBOX_SYSTEM_KEY` and the same value as
`KAJA_SANDBOX_KEY` to make it Kaja's own sandbox.

The image, as production runs it (amd64 only: Chrome for Testing has no Linux arm64 build), joins the
compose API as that sandbox:

```sh
docker compose up -d sandbox
```

## Configuration

| Variable                | Default                                                          | What it does                                                                                         |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `KAJA_API_URL`          | `https://api.kaja.io` in the image, else `http://localhost:3001` | the API it dials                                                                                     |
| `KAJA_SANDBOX_KEY`      | —                                                                | your key from the web app's Sandbox page, or the API's `SANDBOX_SYSTEM_KEY`; unset joins anonymously |
| `SANDBOX_NAME`          | —                                                                | a name shown for it                                                                                  |
| `SANDBOX_STATE_DIR`     | `./.sandbox` (`/data` in the image)                              | where it keeps the id and secret it was welcomed with                                                |
| `MARKETPLACE_DIR`       | `../../marketplace`                                              | whose `abilities/<name>/mcp.toml` manifests are the only servers it runs                             |
| `SANDBOX_OVERRIDES`     | —                                                                | JSON replacing a manifest's command and arguments on this host (the image uses `overrides.json`)     |
| `SANDBOX_CACHE_DIR`     | —                                                                | shared bun, uv and npm caches, so fetched packages stay (the image uses `/home/node/.cache/mcp`)     |
| `SANDBOX_IDLE_MS`       | `600000`                                                         | how long an unused server stays warm                                                                 |
| `SANDBOX_MAX_PROCESSES` | from memory                                                      | most servers at once; unset, one per 512 MB of the memory limit, less 512 MB                         |
| `SANDBOX_SERVER_MEMORY` | `1073741824`                                                     | bytes one server (a browser and all of its processes) may use before it is stopped                   |
| `SANDBOX_ISOLATE_USERS` | `true`                                                           | each user's servers as their own Linux user (only when running as root)                              |
| `SANDBOX_EGRESS_PORT`   | `3128`                                                           | the egress proxy's port; must match `overrides.json`                                                 |
| `WEB_PROXY`             | —                                                                | `http://` proxy the egress proxy tunnels checked traffic through; unset connects directly            |
| `NODE_ENV`              | —                                                                | `production` turns on Sentry (the image sets it)                                                     |

The image's `.env.example` is generated from the sandbox environment schema.

## Observability

The API keeps every sandbox that has ever connected: owner, whether it is online, when it was last seen,
its IP and location, the hello, and the latest heartbeat. Each heartbeat is also kept for 7 days, and the
admin dashboard charts them.

Asked over the socket, the sandbox reports what is running right now: each server with its pseudonymous
user, state, open calls and memory; the host's CPUs, load and memory; and counters since it started
(servers started, failed, stopped and why, refused) plus the egress proxy's allowed, refused and failed
connections. Administrators see this live on the admin dashboard.

The logs have a line for connecting and losing the API, and for every server started or stopped and every
"sandbox is full" refusal, each with the running count.

In production, servers that will not start, exit on their own, or error go to the sandbox's own Sentry
project with their last 20 lines of stderr.

## Not yet

- Per-user limits beyond one server per user and ability.
- Servers that build from source: the image has no compilers or git yet.

---

Next:

[Abilities](/abilities){: .btn .btn-green .fs-5 }
