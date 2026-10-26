# @kaja/sandbox

Runs stdio MCP servers for cloud turns (which can't start commands on the API host) and sends every tool request out (`fetch_url`, HTTP tools, remote MCP), so the API never connects to a tool's host. Anyone can run one (`subztep/kaja-sandbox`): it dials the API's WebSocket (`/sandbox/connect`) and serves what the API tunnels to it.

[docs/use/sandbox.md](../../docs/use/sandbox.md) is the operator guide (running one, request flow, warm servers, egress proxy); keep it in step with changes here.

## How it fits

- A cloud turn always gets `mcpSandbox` (`apps/api/src/features/nasi/chat.ts`); nasi's `sandboxedMcpTarget` points each stdio ability at `SANDBOX_ORIGIN/mcp/<name>`, and that origin's requests go to `mcpSandbox.fetch`
- API side: `apps/api/src/features/sandbox/`. `connect.ts` takes the owner from `X-Kaja-Sandbox-Key` (`SANDBOX_SYSTEM_KEY` = official, a user's `sandbox_owner` key, none = anonymous). `registry.ts`'s `pickSandbox`: last pick → own → shared (user's `use_shared` and owner's `share`) → official
- A tool request is a `fetch` frame (one hop; the API checks each redirect). `egressFor` picks by the key the request carries (`keyTrust`): none → any sandbox, a `--local` client's own → theirs or the official one, an admin's server-wide key → official only
- Frames are JSON (`sandboxFrameSchema`/`apiSandboxFrameSchema` in `@kaja/schema/api`). A sandbox sees users only as `pseudonymFor(userId, sandboxId)`
- A `--local` TUI reaches sandbox-hosted abilities through `/sandbox/relay/mcp/<ability>` (`features/sandbox/relay.ts`); `X-Kaja-Ability-Key` counts as the user's own key

## Process pool

- One relay (`src/relay.ts`) per (user, ability): one stdio child shared by many HTTP sessions, ids renumbered, initialized once, so server state (a browser's pages) survives between turns
- Cap: `SANDBOX_MAX_PROCESSES`, else from memory. When full it stops the least recently used idle server, else answers 503 `x-kaja-sandbox-full`, and `mcpSandboxFor` tries another sandbox (up to 3)
- Server-to-client requests (sampling, roots, elicitation) get "method not found"; only ping is answered

## Rules

- Commands come only from the sandbox's own manifests (`MARKETPLACE_DIR/mcp`) and `SANDBOX_OVERRIDES`; a request only names the ability. Local-only manifests (`localOnly`, `roots`) never run here
- A child gets PATH, a throwaway HOME, the cache dirs, its manifest's `env` and the proxy vars, nothing else (not `KAJA_SANDBOX_KEY`). Shared caches are fine only while just the repo's own manifests run
- With root and `SANDBOX_ISOLATE_USERS`, each user's servers run as their own uid (`src/isolation.ts`: `prlimit`, `setpriv`, no capabilities, `0700` HOMEs)
- A keyed server (`auth.in = "env"`) gets its key from the API's `request` frame, restarts when the key changes, and never writes it to disk
- A sandbox that's neither the user's own nor official is borrowed: `McpSandbox.close` sends `release` and the server stops at once; `trustedSandbox` abilities never go to one

## Egress

All outbound traffic goes through `src/egress.ts`: it refuses non-public addresses (`isPrivateAddress`) for literals and every resolved address, then connects to the address it checked (no DNS rebinding). Only http(s). In compose the sandbox has its own network (only the api joins it).

- Chrome goes out only through the egress proxy (`--proxyServer`, `--proxy-bypass-list=<-loopback>`) and opens only http(s) pages (`--allowedUrlPattern`, a second wall around other users' profiles); the proxy port must match `SANDBOX_EGRESS_PORT`. `WEB_PROXY` (`http://` only) chains each checked connection through an upstream proxy
- Server processes get the proxy through env (`proxyEnv` in `src/manifests.ts`, incl. `NODE_USE_ENV_PROXY=1`). That's cooperative: a process ignoring it connects directly
- `bun src/cli.ts egress-check <url>` debugs one GET through the proxy

## Docker image

- One multi-runtime image so manifests run as on the user's machine: `resolveLaunch` with `self: false` runs npm packages with npx (bun's cache can't be shared between uids) and PyPI ones with uvx; nothing runs docker. No compilers or git yet
- `overrides.json` changes only what the host needs; chrome-devtools gets the pinned `/opt/mcp` copy with the headless shell
- `SANDBOX_CACHE_DIR` keeps fetched packages across starts and users (bun's excepted: per uid, in its HOME); new packages are fetched through the egress proxy
- Bump `CHROME_DEVTOOLS_MCP_VERSION` and `CHROME_HEADLESS_SHELL_VERSION` together (the shell must match its Puppeteer's `PUPPETEER_REVISIONS`). amd64 only: Chrome for Testing has no Linux arm64
- Docker Scout scans a `buildx` OCI archive with provenance and SBOM, like the release build (`SubZtep/dockerhub-action` in `dockerhub.yaml`): keep the two in step, or the PR compare reports package changes that aren't real. A weekly run scans the released image and fails only on fixable critical/high CVEs

## Testing

`bun test apps/sandbox/tests` runs a fixture stdio server through the real relay and the API's `SandboxTunnel` in-process; the API's sandbox tests connect real sandboxes over the WebSocket.
