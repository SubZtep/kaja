type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal"

type LogObject = Record<string, unknown>

type LogMethod = (message: string) => void
type LogMethodWithObject = (object: LogObject, message?: string) => void

type LogSinkMethod = (object: LogObject, message?: string) => void

export type Logger = {
  [level in LogLevel]: LogMethod & LogMethodWithObject
}

export type LogSink = {
  [level in LogLevel]: LogSinkMethod
}

type CreateLoggerOptions = {
  app: string
  env?: string
  bindings?: LogObject
  sink: LogSink
}

function mergeBindings(base: LogObject, incoming?: LogObject) {
  return incoming ? { ...base, ...incoming } : base
}

function createLevelMethod(level: LogLevel, sink: LogSink, baseBindings: LogObject) {
  const method = (first: string | LogObject, second?: string) => {
    if (typeof first === "string") {
      sink[level](baseBindings, first)
      return
    }

    sink[level](mergeBindings(baseBindings, first), second)
  }

  return method as LogMethod & LogMethodWithObject
}

export function createLogger({ app, env = "development", bindings = {}, sink }: CreateLoggerOptions) {
  const baseBindings = { app, env, ...bindings }

  return {
    trace: createLevelMethod("trace", sink, baseBindings),
    debug: createLevelMethod("debug", sink, baseBindings),
    info: createLevelMethod("info", sink, baseBindings),
    warn: createLevelMethod("warn", sink, baseBindings),
    error: createLevelMethod("error", sink, baseBindings),
    fatal: createLevelMethod("fatal", sink, baseBindings)
  }
}
