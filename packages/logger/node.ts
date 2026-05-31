import pino from "pino"
import { createLogger } from "./core"

type NodeLoggerOptions = {
  app: string
  env?: string
  level?: string
  bindings?: Record<string, unknown>
}

function createNodeTransport(env: string) {
  if (env !== "development") return undefined

  try {
    return pino.transport({
      targets: [
        {
          target: "pino-pretty",
          level: "trace",
          options: {
            ignore: "pid,hostname",
            translateTime: "SYS:HH:MM",
            levelFirst: true,
            singleLine: true,
            colorize: true,
            destination: 1 // 1 is stdout, all logs (including error) go to stdout
          }
        }
      ]
    })
  } catch {
    // If pino-pretty can't be resolved in some runtime images, fallback to JSON logs.
    return undefined
  }
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
