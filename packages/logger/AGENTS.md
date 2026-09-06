# @kaja/logger

Shared logging for node (Pino) and browser (console), with a unified `message, payload?` call style.

## Layout

```
index.ts      # auto-detect env, cached logger, trace/debug/info/warn/error/fatal + default export
core.ts       # createLogger, Logger / LogSink types
node.ts       # Pino; silent unless KAJA_LOG_LEVEL is set, then pino-pretty or file append
browser.ts    # console.* sinks, silent unless KAJA_LOG_LEVEL is set
```

## API

```ts
import { info, error } from "@kaja/logger"

info("node connected", { nodeId })
error("API request failed", { path, response })
```

## Configuration (env)

| Variable | Node | Browser (Vite) | Default |
|----------|------|----------------|---------|
| App name | `KAJA_APP_NAME` | `import.meta.env.KAJA_APP_NAME` | `"unknown"` |
| Level | `KAJA_LOG_LEVEL` | `import.meta.env.KAJA_LOG_LEVEL` | unset = no log output |
| Mode | `NODE_ENV` | `import.meta.env.MODE` | dev / production |
| Log file (node, wins over `NODE_ENV`) | `KAJA_LOG_FILE` | — | unset = fall through to `NODE_ENV` selection |
| Axiom dataset (node, production, no `KAJA_LOG_FILE`) | `AXIOM_DATASET` | — | unset = silent |
| Axiom token (node, production, no `KAJA_LOG_FILE`) | `AXIOM_TOKEN` | — | unset = silent |

### Level gating: `KAJA_LOG_LEVEL` unset means silent

`KAJA_LOG_LEVEL` is the single switch for whether anything logs at all, in both node and browser.

- **Node** (`node.ts`): if `KAJA_LOG_LEVEL` is unset, Pino is created with `level: "silent"` and a no-op destination. If set, Pino's own level filtering applies (the source of truth — do not reimplement level ordering here).
- **Browser** (`browser.ts`): if `KAJA_LOG_LEVEL`/`import.meta.env.KAJA_LOG_LEVEL` is unset, every sink method is a no-op. If set, a small `LEVEL_VALUE` table (mirroring Pino's own ordering) gates each `console.*` call — this duplication is necessary because the browser has no Pino to defer to.

### Node destination selection (`node.ts`)

When `KAJA_LOG_LEVEL` is set, destination selection runs in this order:

1. `KAJA_LOG_FILE` set → append JSON lines there (`pino.destination({ append: true, mkdir: true })`), **regardless of `NODE_ENV`**. This wins over everything else because a TUI app (`apps/cli`, an Ink app that repaints the terminal continuously) can never log to the console — pretty-print or any other stdout/stderr write would corrupt the display. `@kaja/logger` has no app-specific path knowledge, so this env var is the only way a path gets in — `apps/cli` does not set it itself (logging there is opt-in: a developer sets `KAJA_LOG_FILE`/`KAJA_LOG_LEVEL` in `apps/cli/.env`, e.g. to `getPaths().cache` joined with `"kaja.log"`, to get a log file; otherwise the CLI is silent).
2. Else, `NODE_ENV`:
   a. `"development"` → `pino-pretty`, used as a direct synchronous stream (`PinoPretty(...)` passed as pino's destination) — never `pino.transport()`, since that spawns a worker via thread-stream, which Bun can't bundle.
   b. `"production"`, `AXIOM_DATASET` and `AXIOM_TOKEN` both set → `@axiomhq/pino`'s default export, likewise a plain stream (not `pino.transport()`). Its export is `async` (though it resolves before any real I/O) — `createPinoLogger` builds the Pino instance behind a one-time promise so `createNodeLogger` itself stays synchronous for callers; sink methods fire-and-forget into that promise. This is how `apps/api` and `apps/web` (server-side) ship logs.
   c. Anything else (production without Axiom creds, staging, unset, etc.) → no-op destination.

### Flush on exit (Axiom only)

`@axiomhq/pino` batches events; they only ship on flush, which its `close` hook triggers — that only fires when the stream is ended. Without handling this, a clean shutdown (deploy restart, `SIGTERM`) can silently drop the last buffered batch. `registerExitFlush` in `node.ts` hooks `SIGTERM`/`SIGINT` (once, guarded by a module-level flag against multiple `createNodeLogger` calls) to `.end()` the Axiom stream before exiting.

This has a real consequence worth understanding: **registering a signal listener at all replaces Node/Bun's default "exit immediately" behavior for that signal** — confirmed by testing, not assumed. So once hooked, the handler must call `process.exit()` itself or the process hangs forever on `SIGTERM`, which would hang every Disco deploy/restart. It does so after `.end()`'s callback fires (flush attempted, success or failure — `pino-abstract-transport`'s `_destroy` calls back either way) or after a `2s` timeout, whichever comes first, so a hung/slow flush can't block shutdown indefinitely.

This only engages when the Axiom destination is actually created (`NODE_ENV=production` + both Axiom vars set) — the `KAJA_LOG_FILE` and pretty-print paths never touch `process.on`/`process.once`, so they don't affect the host app's own signal handling.

## Conventions

- Prefer the static helpers (`info`, `warn`, …) for app code
- Signature is **`(message, payload?)`** — not Pino’s `(obj, msg)` at the call site (wrapper adapts)
- Pass `Error` instances in the payload as `{ error }` (or any key) — `core.ts`'s `mergeBindings` serializes them to `{ name, message, stack }` before merging, since a plain object spread silently drops an `Error`'s own properties (they're inherited getters, not enumerable own properties)
- `sideEffects: false` in package.json — keep it that way
- Do not log secrets (tokens, API keys, passwords)

## Boundaries

- No dependency on `@kaja/schema` or app code
- Keep browser bundle free of Node-only modules (separate `node.ts` / `browser.ts`)
