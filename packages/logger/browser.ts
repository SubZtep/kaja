import { createLogger } from "./core"

type BrowserLoggerOptions = {
  app: string
  env?: string
  bindings?: Record<string, unknown>
}

function toConsoleArgs(object: Record<string, unknown>, message?: string) {
  if (message) return [message, object]
  return [object]
}

export function createBrowserLogger({ app, env, bindings }: BrowserLoggerOptions) {
  return createLogger({
    app,
    env,
    bindings,
    sink: {
      trace: (object, message) => console.debug(...toConsoleArgs(object, message)),
      debug: (object, message) => console.debug(...toConsoleArgs(object, message)),
      info: (object, message) => console.info(...toConsoleArgs(object, message)),
      warn: (object, message) => console.warn(...toConsoleArgs(object, message)),
      error: (object, message) => console.error(...toConsoleArgs(object, message)),
      fatal: (object, message) => console.error(...toConsoleArgs(object, message))
    }
  })
}
