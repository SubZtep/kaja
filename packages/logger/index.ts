import { createBrowserLogger } from "./browser"
import { createNodeLogger } from "./node"

type LogFunction = (message: string, payload?: Record<string, unknown>) => void

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

// Cache the logger instance
let cachedLogger: {
  trace: LogFunction
  debug: LogFunction
  info: LogFunction
  warn: LogFunction
  error: LogFunction
  fatal: LogFunction
} | null = null

function getLogger() {
  if (cachedLogger) return cachedLogger

  // Auto-detect environment
  const isBrowser = typeof window !== "undefined"
  const isNode = typeof process !== "undefined" && process.versions?.node

  // Get app name from environment (fallback to "unknown")
  const app = (isNode ? process.env.KAJA_APP_NAME : undefined) ?? "unknown"

  // Get log level from environment (fallback to "warn")
  const level = (isNode ? process.env.KAJA_LOG_LEVEL : undefined) ?? "warn"

  // Get environment mode
  const env = isNode
    ? (process.env.NODE_ENV ?? "development")
    : typeof import.meta.env !== "undefined"
      ? import.meta.env.MODE
      : "production"

  if (isBrowser) {
    const browserLogger = createBrowserLogger({ app, env })

    // Convert to new API signature: log(message, payload) instead of log(payload, message)
    cachedLogger = {
      trace: (message, payload) => browserLogger.trace(payload ?? {}, message),
      debug: (message, payload) => browserLogger.debug(payload ?? {}, message),
      info: (message, payload) => browserLogger.info(payload ?? {}, message),
      warn: (message, payload) => browserLogger.warn(payload ?? {}, message),
      error: (message, payload) => browserLogger.error(payload ?? {}, message),
      fatal: (message, payload) => browserLogger.fatal(payload ?? {}, message)
    }
  } else {
    const nodeLogger = createNodeLogger({ app, env, level })

    // Convert to new API signature: log(message, payload) instead of log(payload, message)
    cachedLogger = {
      trace: (message, payload) => nodeLogger.trace(payload ?? {}, message),
      debug: (message, payload) => nodeLogger.debug(payload ?? {}, message),
      info: (message, payload) => nodeLogger.info(payload ?? {}, message),
      warn: (message, payload) => nodeLogger.warn(payload ?? {}, message),
      error: (message, payload) => nodeLogger.error(payload ?? {}, message),
      fatal: (message, payload) => nodeLogger.fatal(payload ?? {}, message)
    }
  }

  return cachedLogger
}

// Export static functions
export function trace(message: string, payload?: Record<string, unknown>) {
  getLogger().trace(message, payload)
}

export function debug(message: string, payload?: Record<string, unknown>) {
  getLogger().debug(message, payload)
}

export function info(message: string, payload?: Record<string, unknown>) {
  getLogger().info(message, payload)
}

export function warn(message: string, payload?: Record<string, unknown>) {
  getLogger().warn(message, payload)
}

export function error(message: string, payload?: Record<string, unknown>) {
  getLogger().error(message, payload)
}

export function fatal(message: string, payload?: Record<string, unknown>) {
  getLogger().fatal(message, payload)
}

// Convenience alias
export const log = info
