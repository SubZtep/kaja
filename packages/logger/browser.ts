import { createLogger, type LogSink } from "./core"

type LogLevel = keyof LogSink

type BrowserLoggerOptions = {
  app: string
  env?: string
  level?: LogLevel
  bindings?: Record<string, unknown>
}

// Mirrors Pino's own level ordering (pino/lib/constants.js), since the browser has no Pino to defer to.
const LEVEL_VALUE: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
}

function toConsoleArgs(object: Record<string, unknown>, message?: string) {
  if (message) return [message, object]
  return [object]
}

export function createBrowserLogger({ app, env, level, bindings }: BrowserLoggerOptions) {
  const minLevelValue = level ? LEVEL_VALUE[level] : undefined

  function guard(level: LogLevel, write: (object: Record<string, unknown>, message?: string) => void) {
    return (object: Record<string, unknown>, message?: string) => {
      if (minLevelValue === undefined || LEVEL_VALUE[level] < minLevelValue) return
      write(object, message)
    }
  }

  return createLogger({
    app,
    env,
    bindings,
    sink: {
      trace: guard("trace", (object, message) => console.debug(...toConsoleArgs(object, message))),
      debug: guard("debug", (object, message) => console.debug(...toConsoleArgs(object, message))),
      info: guard("info", (object, message) => console.info(...toConsoleArgs(object, message))),
      warn: guard("warn", (object, message) => console.warn(...toConsoleArgs(object, message))),
      error: guard("error", (object, message) => console.error(...toConsoleArgs(object, message))),
      fatal: guard("fatal", (object, message) => console.error(...toConsoleArgs(object, message)))
    }
  })
}
