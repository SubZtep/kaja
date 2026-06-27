import pino from "pino"
import { createLogger } from "./core"

type NodeLoggerOptions = {
  app: string
  env?: string
  level?: string
  bindings?: Record<string, unknown>
}

function createNodeTransport(_env: string) {
  // Never use pino.transport() - it uses thread-stream which can't be bundled by Bun
  // In production, use JSON logs. In development (local), use default pino output.
  // pino-pretty is excluded to avoid bundling issues
  return undefined
}

export function createNodeLogger({
  app,
  env = process.env.NODE_ENV ?? "development",
  level = "trace",
  bindings = {}
}: NodeLoggerOptions) {
  const transport = createNodeTransport(env)
  const pinoLogger = pino({ level, base: null }, transport)

  const logger = createLogger({
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

  return logger
}
