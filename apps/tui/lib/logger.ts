import { appendFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const
type LogLevel = (typeof LEVELS)[number]

// Error instances have no enumerable own properties, so JSON.stringify would print them as {}.
function serialize(value: unknown) {
  return value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
}

function write(level: LogLevel, message: string, payload?: Record<string, unknown>) {
  const min = LEVELS.indexOf(process.env.KAJA_LOG_LEVEL as LogLevel)
  const file = process.env.KAJA_LOG_FILE
  if (min === -1 || !file || LEVELS.indexOf(level) < min) return
  const fields = Object.fromEntries(Object.entries(payload ?? {}).map(([key, value]) => [key, serialize(value)]))
  try {
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...fields })}\n`)
  } catch {
    // Logging must never break the app, and the Ink UI can't take console output.
  }
}

/** Opt-in JSON-lines log: silent unless KAJA_LOG_LEVEL and KAJA_LOG_FILE are set, and never writes to the terminal (Ink owns it). */
export const log = Object.fromEntries(
  LEVELS.map(level => [level, (message: string, payload?: Record<string, unknown>) => write(level, message, payload)])
) as Record<LogLevel, (message: string, payload?: Record<string, unknown>) => void>
