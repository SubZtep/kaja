import axiomTransport from "@axiomhq/pino"
import pino, { type Logger as Pino } from "pino"
import PinoPretty from "pino-pretty"
import { createLogger, type LogSink } from "./core"

type LogLevel = keyof LogSink

type NodeLoggerOptions = {
  app: string
  env?: string
  level?: LogLevel
  bindings?: Record<string, unknown>
}

const NOOP_DESTINATION = { write: () => {} }

// @axiomhq/pino batches events and only ships them on flush, which its close hook triggers - that only
// fires when the stream is ended. Without this, a clean process shutdown (deploy restart, SIGTERM) can
// silently drop the last buffered batch. Registering a SIGTERM/SIGINT listener at all replaces Node's
// default "exit immediately" behavior for that signal, so once hooked we must call process.exit()
// ourselves or the process hangs forever - bounded by a timeout in case the flush itself hangs.
const EXIT_FLUSH_TIMEOUT_MS = 2000
let exitFlushRegistered = false
function registerExitFlush(destination: { end: (cb?: () => void) => void }) {
  if (exitFlushRegistered) return
  exitFlushRegistered = true
  const flush = () => {
    const timer = setTimeout(() => process.exit(0), EXIT_FLUSH_TIMEOUT_MS)
    destination.end(() => {
      clearTimeout(timer)
      process.exit(0)
    })
  }
  process.once("SIGTERM", flush)
  process.once("SIGINT", flush)
}

async function createNodeDestination(env: string | undefined) {
  // Never use pino.transport() - it uses thread-stream which can't be bundled by Bun.
  // pino-pretty and @axiomhq/pino's default export are both plain streams, used directly as pino's destination.

  // KAJA_LOG_FILE wins in any env - e.g. the CLI is an Ink TUI that repaints the terminal continuously, so
  // console output (pretty-print) would corrupt the display; it always logs to a file instead.
  const logFile = process.env.KAJA_LOG_FILE
  if (logFile) return pino.destination({ dest: logFile, append: true, mkdir: true })

  if (env === "development") {
    return PinoPretty({ colorize: true })
  }

  if (env === "production") {
    const dataset = process.env.AXIOM_DATASET
    const token = process.env.AXIOM_TOKEN
    if (dataset && token) {
      const destination = await axiomTransport({ dataset, token })
      registerExitFlush(destination)
      return destination
    }

    return NOOP_DESTINATION
  }

  return NOOP_DESTINATION
}

// @axiomhq/pino's export is async (though it resolves before any real I/O); build the pino instance lazily
// behind a one-time promise so createNodeLogger itself stays synchronous for its callers.
function createPinoLogger(env: string | undefined, level: LogLevel | undefined): Promise<Pino> {
  return (async () => {
    const destination = level ? await createNodeDestination(env) : NOOP_DESTINATION
    return pino({ level: level ?? "silent", base: null }, destination)
  })()
}

export function createNodeLogger({ app, env, level, bindings = {} }: NodeLoggerOptions) {
  const pinoLoggerPromise = createPinoLogger(env, level)

  return createLogger({
    app,
    env,
    bindings,
    sink: {
      trace: (object, message) => void pinoLoggerPromise.then(pinoLogger => pinoLogger.trace(object, message)),
      debug: (object, message) => void pinoLoggerPromise.then(pinoLogger => pinoLogger.debug(object, message)),
      info: (object, message) => void pinoLoggerPromise.then(pinoLogger => pinoLogger.info(object, message)),
      warn: (object, message) => void pinoLoggerPromise.then(pinoLogger => pinoLogger.warn(object, message)),
      error: (object, message) => void pinoLoggerPromise.then(pinoLogger => pinoLogger.error(object, message)),
      fatal: (object, message) => void pinoLoggerPromise.then(pinoLogger => pinoLogger.fatal(object, message))
    }
  })
}
