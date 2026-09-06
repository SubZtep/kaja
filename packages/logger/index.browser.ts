import { createBrowserLogger } from "./browser"
import type { LogSink } from "./core"

type LogFunction = (message: string, payload?: Record<string, unknown>) => void
type LogLevel = keyof LogSink

const LOG_LEVELS = new Set<string>(["trace", "debug", "info", "warn", "error", "fatal"])

function toLogLevel(value: string | undefined): LogLevel | undefined {
  return value && LOG_LEVELS.has(value) ? (value as LogLevel) : undefined
}

/** Vite injects `import.meta.env`; plain TS has no such field — read via cast. */
function viteEnv(key: "KAJA_APP_NAME" | "KAJA_LOG_LEVEL" | "MODE"): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return env?.[key]
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

  const app = viteEnv("KAJA_APP_NAME") ?? "unknown"
  const level = toLogLevel(viteEnv("KAJA_LOG_LEVEL"))
  const env = viteEnv("MODE") ?? "production"

  const browserLogger = createBrowserLogger({ app, env, level })

  // Convert to new API signature: log(message, payload) instead of log(payload, message)
  cachedLogger = {
    trace: (message, payload) => browserLogger.trace(payload ?? {}, message),
    debug: (message, payload) => browserLogger.debug(payload ?? {}, message),
    info: (message, payload) => browserLogger.info(payload ?? {}, message),
    warn: (message, payload) => browserLogger.warn(payload ?? {}, message),
    error: (message, payload) => browserLogger.error(payload ?? {}, message),
    fatal: (message, payload) => browserLogger.fatal(payload ?? {}, message)
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

// Default export: callable as log(message, payload) (alias for info), with log.trace/debug/warn/error/fatal
export default Object.assign(info, { trace, debug, info, warn, error, fatal })
