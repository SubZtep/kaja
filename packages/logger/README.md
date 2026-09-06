# @kaja/logger

Shared logging for node (Pino) and browser (console), with a unified `message, payload?` call style.

## Usage

```ts
import { info, warn, error, debug, trace, fatal } from "@kaja/logger"

info("node connected", { nodeId })
warn("retrying request", { attempt: 2 })
error("API request failed", { path, response })
```

Or via the default export — `log(...)` itself is an alias for `info`, with the other levels as methods:

```ts
import log from "@kaja/logger"

log("node connected", { nodeId })
log.warn("retrying request", { attempt: 2 })
log.error("API request failed", { path, response })
```

The environment (node vs. browser) is auto-detected, so app code just imports the top-level functions — no setup required.

For custom sinks (e.g. in tests), use `createLogger` directly:

```ts
import { createLogger } from "@kaja/logger"

const logger = createLogger({
  app: "my-test",
  sink: {
    trace: (obj, msg) => {},
    debug: (obj, msg) => {},
    info: (obj, msg) => {},
    warn: (obj, msg) => {},
    error: (obj, msg) => {},
    fatal: (obj, msg) => {}
  }
})
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

`NODE_ENV`/`MODE` is attached to log lines as metadata (the `env` field), and on the node side also picks the destination (see below). Whether logging happens at all is still controlled by `KAJA_LOG_LEVEL`.

## Output behavior

**If `KAJA_LOG_LEVEL` is not set, nothing logs at all — in node or browser.**

When `KAJA_LOG_LEVEL` is set:

- **Browser**: logs at or above that level go to `console.*` as normal.
- **Node**:
  1. `KAJA_LOG_FILE` set → append JSON lines there, in any `NODE_ENV`. This is what `apps/cli` uses — as a terminal UI app, it can never log to the console (that would corrupt the display), so a log file is the only safe destination regardless of dev/prod.
  2. Else, based on `NODE_ENV`:
     - `"development"` → pretty-print to the console via `pino-pretty`.
     - `"production"` → send to Axiom via `@axiomhq/pino`, using `AXIOM_DATASET`/`AXIOM_TOKEN`. If either is missing, no destination (silent).
     - Anything else → no destination (silent).

  Level filtering on the node side is handled by Pino itself — this package doesn't reimplement Pino's level ordering there. The browser has no Pino to defer to, so `browser.ts` has its own small level-ordering table that mirrors Pino's.

## Flushing Axiom on shutdown

`@axiomhq/pino` batches events and only ships them when its stream is closed. To avoid silently dropping the last batch on a clean shutdown (deploy restart, `SIGTERM`), `node.ts` ends the Axiom stream when it receives `SIGTERM`/`SIGINT` — but only when the Axiom destination is actually in use (never for the file or pretty-print paths).

Registering that signal handler at all means Node/Bun's default "exit immediately" behavior for `SIGTERM`/`SIGINT` no longer applies once the Axiom destination is active, so the handler calls `process.exit()` itself after the flush attempt finishes (or after a 2s timeout, whichever is first) — otherwise the process would hang on every restart instead of exiting.

## Why `pino-pretty` is a regular dependency, not a devDependency

pino-pretty's own docs tell you to install it as a `devDependency`, but that assumes you use it the standard way: via `pino.transport({ target: "pino-pretty" })`. In that mode, pino spawns a worker thread that `require()`s `pino-pretty` by name at runtime, entirely outside your app's module graph — so it only needs to exist on disk in dev, and never needs to be bundled or resolved by your bundler.

`node.ts` doesn't use `pino.transport()`, because it relies on `thread-stream` internally, which Bun can't bundle. Instead, `pino-pretty` is `import`ed directly and called as a plain function to get a synchronous stream, which is passed to `pino()` as its destination. Because that's a real static `import` evaluated at module load — in code that ships to every environment where `KAJA_LOG_LEVEL` might be set, not just local dev — `pino-pretty` must actually be resolvable in `node_modules` wherever this package runs, including production installs. If it were a devDependency, a production install that prunes devDependencies (e.g. `bun install --production`) would leave it missing, and the `import` in `node.ts` would throw at startup even on runs that never hit the pretty-print branch (e.g. because `NODE_ENV` is `"production"`).

So: keep it a normal `dependency`. This is a direct consequence of opting out of `pino.transport()`, not a mistake. The same reasoning applies to `@axiomhq/pino`, which is also imported directly and used as a plain stream rather than via `pino.transport()`.

## Boundaries

- No dependency on `@kaja/schema` or app code.
- Keep the browser bundle free of Node-only modules — logic is split across `node.ts` / `browser.ts`.
- Do not log secrets (tokens, API keys, passwords).
