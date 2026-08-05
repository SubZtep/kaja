import pino from "pino"
import PinoPretty from "pino-pretty"
import { createLogger, type LogSink } from "./core"

type LogLevel = keyof LogSink

type NodeLoggerOptions = {
  app: string
  env?: string
  level?: LogLevel
  bindings?: Record<string, unknown>
}

function createNodeDestination() {
  // Never use pino.transport() - it uses thread-stream which can't be bundled by Bun.
  // pino-pretty is used directly as a synchronous stream instead.
  const logFile = process.env.KAJA_LOG_FILE
  if (logFile) {
    return pino.destination({ dest: logFile, append: true, mkdir: true })
  }

  return PinoPretty({ colorize: true })
}

export function createNodeLogger({ app, env, level, bindings = {} }: NodeLoggerOptions) {
  // No KAJA_LOG_LEVEL set means no logging at all; otherwise Pino's own level filtering applies.
  const destination = level ? createNodeDestination() : { write: () => {} }
  const pinoLogger = pino({ level: level ?? "silent", base: null }, destination)

  return createLogger({
    app,
    env,
    bindings,
    sink: {
      trace: (object, message) => pinoLogger.trace(object, message),
      debug: (object, message) => pinoLogger.debug(object, message),
      info: (object, message) => pinoLogger.info(object, message),
      warn: (object, message) => pinoLogger.warn(object, message),
      error: (object, message) => pinoLogger.error(object, message),
      fatal: (object, message) => pinoLogger.fatal(object, message)
    }
  })
}
