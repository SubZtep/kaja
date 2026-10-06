# Kaja audit

Read-only review of this monorepo, then the three fixes named at the end. No P0. Authz on sessions, widget memory, admin routes, config export, and user secrets is enforced and covered by integration tests. The SSRF helper, sandbox egress proxy, and AES-GCM secret store should stay as they are.

## 1. Map

Bun workspace (`package.json` `workspaces`: `apps/*`, `packages/*`). Language is TypeScript (ESNext, Biome, Zod in `@kaja/schema`). SQL lives in `apps/api/migrations/*.sql` (create-only, lexicographic, re-applied while 0.x). TOML is config, locales, and marketplace manifests. Docs are Jekyll under `docs/` and are not part of `bun test`.

| Package | Role | Depends on |
|---|---|---|
| `@kaja/shared` | date, id, locale, net, telegram, text, ui | — |
| `@kaja/schema` | Zod contracts (`/api`, `/config`, `/store`, `/abilities`, `/nasi`, `/env`, `/cli`, `/tombi`) | shared |
| `@kaja/nasi` | Agent loop, tools, SSRF guard, stores | schema, shared |
| `@kaja/api` | Hono API, Better Auth, Postgres, widget bundle | nasi, schema, shared |
| `@kaja/web` | TanStack Start landing + admin | schema, shared |
| `@kaja/tui` | Ink CLI (`apps/tui/cli.ts`) | nasi, schema, shared |
| `@kaja/sandbox` | stdio MCP host, egress proxy, uid isolation | nasi, schema, shared |

Entry points: `bun dev` (api+web), `bun dev:tui`, `bun dev:sandbox`, `bun lint`, `bun typecheck`, `bun test`, `bun check:env`, `bun check:locales`, `bun check:models`. CI (`.github/workflows/ci.yaml`) runs lint, typecheck, Docker builds, tests (Postgres + RustFS), and the drift checks. Dependabot updates bun and GitHub Actions weekly. `scripts/sonar.ts` lists SonarCloud PR issues and is not a CI job. There is no `bun audit` step.

Generated or vendored, not reviewed: `apps/web/src/paraglide/**`, `apps/web/src/routeTree.gen.ts`, `apps/*/src/env.d.ts` and `apps/tui/env.d.ts`, `docs/config/models.*.toml`, `docs/config/schemas/*.json`, non-`en-GB` locale files (placeholders from `bun sync:locales`). `packages/logger/` has no source, only `node_modules`. `node_modules/` ignored.

Secrets seen, not printed: Sentry ingest DSNs (public client keys) hardcoded in `apps/api/src/app.ts` and `apps/web/instrument.server.mjs`. `apps/api/.env.example` has the dev placeholders `CONFIG_API_TOKEN=kaja` (production boot rejects this, `packages/schema/env/api.ts`) and `STORAGE_SECRET_ACCESS_KEY=kaja-dev-storage`. `docs/config/secrets.toml` is a commented template.

## 2. Checks

`bun run lint` (Biome + Tombi) exits 0. Biome reported 89 warnings across 695 files, mostly `noExplicitAny` and Ink `useExhaustiveDependencies`. The script does not fail on warnings. Tombi format and lint passed (`50 files linted successfully`).

`bun typecheck` and `bun test` were not run in the read-only pass. Typecheck writes `.tsbuildinfo`. The test preload rebuilds `<devdb>_test`. CI requires both. Nothing in the tree shows a current failure. The 89 warnings are not a work item.

## 3. Findings

### P1 — fix

**Local `run_command` auto-runs reads of credential files.** `read_file` refuses `secrets.toml` (`packages/nasi/src/tools/path-guard.ts`, `DENIED_FILENAMES`). `isSafeCommand` does not. The default pattern `(cat|head|tail)(\s+-[a-zA-Z0-9]+)*(\s+[\w./~-]+)+` matches `cat secrets.toml` and `cat ~/.config/kaja/secrets.toml`. `~` is in the class, and `runShellCommand` uses `sh -c`, so the shell expands it. Shell metacharacters are blocked (`packages/nasi/src/agent/command-risk.ts`, `SHELL_METACHARACTERS`), and the tests lock that. A fetched page can still prompt-inject a single `cat` of a key file and it runs with no approval (`packages/nasi/src/agent/run.ts`). Cloud turns do not include `run_command` (`CLOUD_SAFE` in `packages/nasi/src/tools/registry.ts`). This is the local TUI only.

`runShellCommand` also has no timeout and buffers all output, so a safe `cat /dev/zero` or `yes` never returns. Same auto-run path.

Fix: after a safe-pattern match, refuse a path segment `secrets.toml` or `.ssh`. Cap stdout and stderr and kill the process on timeout. Keep `cat README.md` allowed.

### P2 — fix

**Cloud model calls do not use the guarded fetch.** `apps/api/src/features/nasi/chat.ts` rejects a provider `baseUrl` only with `isPublicHttpUrl`, which inspects the literal hostname (`packages/shared/net/index.ts`: a DNS name returns true). `resolveContextWindow` then `fetch`es `/props`, `/api/ps`, `POST /api/show`, and `/models` with the provider bearer token (`packages/nasi/src/models/context-window.ts`, default `fetch`). `createOpenAIClient` also uses raw `fetch` (`packages/nasi/src/models/client.ts`). Redirects and DNS rebinding are not re-checked. Only a platform admin can set the URL (`adminMiddleware` on `/admin/providers/*` and `/admin/models/*`). Local Ollama must stay reachable. Do not turn on `allowPrivate` for the cloud path, and do not change the TUI.

Fix: optional `fetch` on `createOpenAIClient` (default remains global `fetch`). The cloud resolver and the context-window probe use `createGuardedFetch` (same public-host, DNS-pin, and same-origin redirect checks as `fetchPublicHttp`, and the body stays a stream so chat completions are not buffered). The stub client on `127.0.0.1:9` stays on raw `fetch`. When `contextWindow` is already set, detection is skipped. Do not send model traffic through `WEB_PROXY`. That would change egress and skip DNS pinning.

**Sandbox uid reuse can collide with a live process.** `UserIsolation` (`apps/sandbox/src/isolation.ts`) hands out uids from 20000 and, after 10 000 distinct users, reuses the least recently used uid. The test locks reuse (`apps/sandbox/tests/isolation.test.ts`). Reuse does not check that the old uid still has processes. Two users then share a uid, so one can read the other's `HOME` and browser profile. `asUser` itself is sound (`prlimit` + `setpriv`, capabilities dropped, args passed as argv).

Fix: `runAs` takes an optional `busy(uid)` and skips a busy uid when reusing. `UserIsolation.create` (the process that runs as root) treats a uid that still has a `/proc` entry as busy. The existing reuse test passes no `busy` function, so it stays green. If every uid is busy, reuse falls back to the least recently used one so allocation cannot stall.

**Every cloud turn reloads the whole session, including images the prompt will drop.** `hydrate` in `apps/api/src/features/nasi/pg-store.ts` selects every `nasi_message` and every tool call, then `loadImages` downloads every referenced object (`packages/nasi/src/store/images.ts`). Compaction keeps the rows ("Stores keep every one", `packages/nasi/src/store/rows.ts`) and only hides old messages from the model. Old images are replaced with a note in the prompt (`withoutOldImages` in `packages/nasi/src/agent/compaction.ts`) after the bytes have been downloaded. No session size was measured. Leave this until a long session is timed. The change, if it is needed, is to skip image bytes for messages before the latest `summary_from` while still returning the rows compaction's indexes need. Not a rewrite of the store.

### P2 — leave alone

**Shared sandboxes can run Chrome.** `use_shared` defaults to false (`sandbox_owner.use_shared`, `settings()` in `apps/api/src/services/sandbox.ts`). `share` defaults to true. Anonymous sandboxes (`user_id` null, no key) are in the shared pool (`usableBy`). `chrome-devtools` does not set `trustedSandbox` (schema default false, `packages/schema/abilities/mcp.ts`). The settings copy states the consequence (`apps/web/messages/en-GB.json` `sandbox_setting_use_shared_hint`: the owner can see pages the browser opens). The prompt adds the same warning when `useShared` is on (`SHARED_SANDBOX_NOTE` in `chat.ts`). Routing fails closed when the trusted-ability lookup throws (`registry.ts`). Do not set `trustedSandbox` or flip `share` without a product decision. Flipping `share` to false would change new rows only.

**`WEB_PROXY` skips DNS pinning.** `assertHopAllowed` returns before `checkedAddress` when `proxy` is set (`packages/nasi/src/security/ssrf.ts`). Literal private URLs are still refused. The proxy is the trust boundary the comments describe. `fetch_url` is omitted from cloud tools when `WEB_PROXY` is unset (`registry.ts`). Leave the helper alone. The operator's proxy must refuse private destinations.

### P3 — leave alone

- **X-Forwarded-For.** `clientIp` (`apps/api/src/core/rate-limit.ts`) trusts the first entry because Disco's Caddy replaces the header. `CF-Connecting-IP` and `X-Real-IP` are not trusted (unit test). A CDN in front without `trusted_proxies` collapses visitors onto the edge IP. It does not, by itself, accept a client-supplied address. Documented.
- **Widget Origin is spoofable off-browser.** The key is public by design (`apps/api/src/features/widget/auth.ts`). Spend is capped per key (`widgetKeyRateLimiter`, 3000 / 10 min). Sessions are owner-scoped (`widget:<key>:<visitor>`), and `loadTurn` rejects another owner's session id.
- **Widget and `/nasi/turn` 500 bodies** include `categorizeError` text (`LLM API: …`). Authenticated nasi users can see provider errors. Widget visitors can too.
- **In-process lock and rate limit** (`apps/api/src/core/lock.ts`). The comment says one API instance. Sandbox sockets are in-process too. Unique `(session_id, seq)` would 500 on a double-write rather than silently corrupt. No change until a second instance is planned.
- **`read_file` / `list_files` have no size cap.** They do honour `secrets.toml`. Local tools, and cloud stubs that run on the user's machine.
- **Web `userRequired` compares `role` with `!== "admin"`** (`apps/web/src/lib/loaders.ts`). The API splits comma-separated roles (`apps/api/src/features/auth/middleware.ts`). A mismatch fails closed on the web.
- **Biome's 89 warnings.** Not a lint failure.
- **Sentry DSNs in source.** Public ingest keys.
- **`ABILITY_KEYS` server-wide keys.** Marked TODO in `packages/schema/env/api.ts` and `apps/api/src/services/ability.ts`.
- **Duplicate Telegram HTML helpers** (`packages/shared/telegram/markdown.ts` and `bot.ts`).
- **Open redirect via `?redirect=`.** Better Auth `originCheckMiddleware` rejects a `callbackURL` that is not a trusted origin. The trusted origin is `CORS_ORIGIN`.
- **Chrome `--no-sandbox`** in `apps/sandbox/overrides.json`, with `--proxy-bypass-list=<-loopback>` and non-proxied UDP disabled. The process is dropped via `setpriv`.
- **Marketplace `tar -xzf`** of a GitHub tarball for `MARKETPLACE_REPO` (default `SubZtep/kaja`) after a sha check (`apps/api/src/services/marketplace.ts`). Operator supply chain.
- **`defaultFindManyLimit: 1000`** in the Better Auth config.

### Reviewed and sound

Parameterized SQL. Dynamic fragments are fixed column lists (`SESSION_COLUMNS`, widget `assignments` from a fixed key set). CSRF on cookie writes without `Authorization` (`apps/api/src/core/csrf.ts`). Config routes fail closed (`isValidConfigToken`). User secrets are AES-256-GCM with AAD `userId\0name` (`apps/api/src/services/secret.ts`). A copied row does not decrypt (integration test). Widget turns do not receive the owner's keys or MCP sandbox (`openNasiFor` skills-only source). Skill `scripts/` are not executed in the cloud (`hasScripts`). The egress proxy connects to the address it checked and refuses private answers (`apps/sandbox/src/egress.ts`). `fetchPublicHttp` pins DNS and re-checks redirects (`packages/nasi/src/security/ssrf.ts`), with tests for rebinding, size, method, and proxy failure.

## 4. Tests

Do not delete any of these. Nothing below is redundant with another suite.

| Suite | What it locks | Verdict |
|---|---|---|
| `apps/api/tests/integration/auth*.ts`, `csrf.test.ts`, `config-auth.test.ts` | Sign-in, snake_case columns, CSRF, config bearer fail-closed | Necessary |
| `apps/api/tests/integration/nasi.test.ts`, `pg-store.test.ts`, `model-pinning.test.ts` | Turn behaviour, owner isolation, model pin | Necessary |
| `apps/api/tests/integration/sandbox.test.ts`, `admin-sandbox.test.ts` | Anonymous vs owned vs official routing; a trusted ability stays off strangers | Necessary |
| `apps/api/tests/integration/ability-*.ts`, `abilities.test.ts`, `widget.test.ts` | Catalog, keys, MCP, widget origin and owner | Necessary |
| `apps/api/tests/integration/telegram-*.ts`, `stats.test.ts`, `timezone.test.ts` | Bot abilities, stats scoping, timestamptz | Necessary |
| `apps/api/tests/unit/*` | Env schema, client IP, SSR secret, config token, lock | Necessary |
| `packages/nasi/tests/security/*` | SSRF, DNS rebinding, body cap, guarded MCP fetch | Necessary |
| `packages/nasi/tests/agent/command-risk.test.ts` | Safe-command allow and metacharacter deny | Necessary. Extended when the credential deny landed |
| `packages/nasi/tests/agent/compaction.test.ts`, store and tool tests | Compaction indexes, tools, HTTP abilities | Necessary |
| `apps/sandbox/tests/egress.test.ts`, `isolation.test.ts`, `sandbox.test.ts` | Proxy allow/refuse, uid reuse, pool and relay | Necessary. `Bun.sleep` waits can flake under load. Not observed failing |
| `apps/tui/tests/**` | CLI config, sqlite store, commands, UI | Necessary for the local agent. A few hook tests poll with `Bun.sleep` (`use-theme.test.tsx`) |
| `packages/shared/tests/is-public-http-url.test.ts`, `is-private-address.test.ts` | The literal-hostname guard | Necessary |
| `apps/web/src/lib/period.test.ts` | Stats period bounds | Necessary and small |
| `apps/web` otherwise | `package.json` `"test": "echo \"no tests\""` | Gap, not a deletion. Authz is enforced and tested on the API. No web suite was added in this pass |

## Fixes in this pass

1. Local safe commands no longer auto-run a path whose segments include `secrets.toml` or `.ssh`. `runShellCommand` caps each stream and kills the child on timeout.
2. Cloud chat and summarizer model calls, and their context-window probes, use the guarded fetch. The TUI still uses ordinary `fetch`, so a model on the user's own network still works.
3. Sandbox uid reuse skips a uid that `busy` reports as in use. The root sandbox process uses a `/proc` scan. Callers that pass no `busy` function keep the previous reuse order.
