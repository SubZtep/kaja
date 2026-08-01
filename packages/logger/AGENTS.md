# @kaja/logger

Shared logging for node (Pino) and browser (console), with a unified `message, payload?` call style.

## Layout

```
index.ts      # auto-detect env, cached logger, trace/debug/info/warn/error/fatal + log alias
core.ts       # createLogger, Logger / LogSink types
node.ts       # Pino + optional pino-pretty in development
browser.ts    # console.* sinks
```

## API

```ts
import { info, error, createLogger } from "@kaja/logger"

info("node connected", { nodeId })
error("API request failed", { path, response })

// Custom sink / tests
const logger = createLogger({ /* ... */ })
```

## Configuration (env)

| Variable | Node | Browser (Vite) | Default |
|----------|------|----------------|---------|
| App name | `KAJA_APP_NAME` | `import.meta.env.KAJA_APP_NAME` | `"unknown"` |
| Level | `KAJA_LOG_LEVEL` | `import.meta.env.KAJA_LOG_LEVEL` | `"warn"` |
| Mode | `NODE_ENV` | `import.meta.env.MODE` | dev / production |

In production node builds, avoid pretty-printing; structured JSON is preferred.

## Conventions

- Prefer the static helpers (`info`, `warn`, …) for app code
- Signature is **`(message, payload?)`** — not Pino’s `(obj, msg)` at the call site (wrapper adapts)
- `sideEffects: false` in package.json — keep it that way
- Do not log secrets (tokens, API keys, passwords)

## Boundaries

- No dependency on `@kaja/schema` or app code
- Keep browser bundle free of Node-only modules (separate `node.ts` / `browser.ts`)
