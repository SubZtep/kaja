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
| Mode (binding only, doesn't gate output) | `NODE_ENV` | `import.meta.env.MODE` | dev / production |
| Log file (node) | `KAJA_LOG_FILE` | — | unset = pretty-print to console |

### Level gating: `KAJA_LOG_LEVEL` unset means silent

`KAJA_LOG_LEVEL` is the single switch for whether anything logs at all, in both node and browser — there is no `NODE_ENV`/dev-vs-prod branching left in this package.

- **Node** (`node.ts`): if `KAJA_LOG_LEVEL` is unset, Pino is created with `level: "silent"` and a no-op destination. If set, Pino's own level filtering applies (the source of truth — do not reimplement level ordering here).
- **Browser** (`browser.ts`): if `KAJA_LOG_LEVEL`/`import.meta.env.KAJA_LOG_LEVEL` is unset, every sink method is a no-op. If set, a small `LEVEL_VALUE` table (mirroring Pino's own ordering) gates each `console.*` call — this duplication is necessary because the browser has no Pino to defer to.

### Node destination selection (`node.ts`)

When `KAJA_LOG_LEVEL` is set:

1. `KAJA_LOG_FILE` set → append JSON lines there (`pino.destination({ append: true })`).
2. Else → `pino-pretty`, used as a direct synchronous stream (`PinoPretty(...)` passed as pino's destination) — never `pino.transport()`, since that spawns a worker via thread-stream, which Bun can't bundle.

## Conventions

- Prefer the static helpers (`info`, `warn`, …) for app code
- Signature is **`(message, payload?)`** — not Pino’s `(obj, msg)` at the call site (wrapper adapts)
- `sideEffects: false` in package.json — keep it that way
- Do not log secrets (tokens, API keys, passwords)

## Boundaries

- No dependency on `@kaja/schema` or app code
- Keep browser bundle free of Node-only modules (separate `node.ts` / `browser.ts`)
