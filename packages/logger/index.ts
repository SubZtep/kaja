import { createBrowserLogger } from "./browser"
import { createNodeLogger } from "./node"

type LogFunction = (message: string, payload?: Record<string, unknown>) => void

export { createLogger, type Logger, type LogSink } from "./core"

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
  const app = (isNode
    ? process.env.KAJA_APP_NAME
    : typeof import.meta.env !== "undefined"
      ? import.meta.env.KAJA_APP_NAME
      : undefined) ?? "unknown"

  // Get log level from environment (fallback to "warn")
  const level = (isNode
    ? process.env.KAJA_LOG_LEVEL
    : typeof import.meta.env !== "undefined"
      ? import.meta.env.KAJA_LOG_LEVEL
      : undefined) ?? "warn"

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
