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
| Mode (binding only) | `NODE_ENV` | `import.meta.env.MODE` | dev / production |
| Log file (node) | `KAJA_LOG_FILE` | — | unset = pretty-print to console |

`NODE_ENV`/`MODE` is only attached to log lines as metadata (the `env` field) — it does not decide whether or where logging happens. That's controlled entirely by `KAJA_LOG_LEVEL` (and `KAJA_LOG_FILE` for node).

## Output behavior

**If `KAJA_LOG_LEVEL` is not set, nothing logs at all — in node or browser.** This is the same rule everywhere; there's no separate dev/production distinction.

When `KAJA_LOG_LEVEL` is set:

- **Browser**: logs at or above that level go to `console.*` as normal.
- **Node**:
  1. `KAJA_LOG_FILE` set → append JSON lines to that file (`pino.destination({ append: true })`).
  2. Otherwise → pretty-print to the console via `pino-pretty`.

  Level filtering on the node side is handled by Pino itself — this package doesn't reimplement Pino's level ordering there. The browser has no Pino to defer to, so `browser.ts` has its own small level-ordering table that mirrors Pino's.

## Why `pino-pretty` is a regular dependency, not a devDependency

pino-pretty's own docs tell you to install it as a `devDependency`, but that assumes you use it the standard way: via `pino.transport({ target: "pino-pretty" })`. In that mode, pino spawns a worker thread that `require()`s `pino-pretty` by name at runtime, entirely outside your app's module graph — so it only needs to exist on disk in dev, and never needs to be bundled or resolved by your bundler.

`node.ts` doesn't use `pino.transport()`, because it relies on `thread-stream` internally, which Bun can't bundle. Instead, `pino-pretty` is `import`ed directly and called as a plain function to get a synchronous stream, which is passed to `pino()` as its destination. Because that's a real static `import` evaluated at module load — in code that ships to every environment where `KAJA_LOG_LEVEL` might be set, not just local dev — `pino-pretty` must actually be resolvable in `node_modules` wherever this package runs, including production installs. If it were a devDependency, a production install that prunes devDependencies (e.g. `bun install --production`) would leave it missing, and the `import` in `node.ts` would throw at startup even on runs that never hit the pretty-print branch (e.g. because `KAJA_LOG_FILE` is set).

So: keep it a normal `dependency`. This is a direct consequence of opting out of `pino.transport()`, not a mistake.

## Boundaries

- No dependency on `@kaja/schema` or app code.
- Keep the browser bundle free of Node-only modules — logic is split across `node.ts` / `browser.ts`.
- Do not log secrets (tokens, API keys, passwords).
