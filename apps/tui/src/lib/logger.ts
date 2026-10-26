import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs"
import { dirname } from "node:path"
import { getLogFile } from "./paths"

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const
type LogLevel = (typeof LEVELS)[number]

// Problems are kept without asking, so a bug report has something to attach; chattier levels are opt-in.
const DEFAULT_LEVEL: LogLevel = "warn"
// Past this the file starts over (the previous one kept as `.1`), so a long-lived install never grows it unbounded.
const MAX_BYTES = 1024 * 1024

// Files already size-checked in this process: once per start is enough.
const checked = new Set<string>()

/**
 * Where log lines go and from which level: KAJA_LOG_FILE, else `kaja.log` in the state folder, from KAJA_LOG_LEVEL,
 * else warn. Undefined when logging is off (`KAJA_LOG_LEVEL=off`, or any value that isn't a level).
 */
export function logTarget(): { file: string; min: number } | undefined {
  const min = LEVELS.indexOf((process.env.KAJA_LOG_LEVEL || DEFAULT_LEVEL) as LogLevel)
  if (min === -1) return undefined
  return { file: process.env.KAJA_LOG_FILE || getLogFile(), min }
}

// Error instances have no enumerable own properties, so JSON.stringify would print them as {}.
function serialize(value: unknown) {
  return value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
}

function startOverIfLarge(file: string) {
  if (checked.has(file)) return
  checked.add(file)
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`)
  } catch {
    // No file yet
  }
}

function write(level: LogLevel, message: string, payload?: Record<string, unknown>) {
  const target = logTarget()
  if (!target || LEVELS.indexOf(level) < target.min) return
  const fields = Object.fromEntries(Object.entries(payload ?? {}).map(([key, value]) => [key, serialize(value)]))
  try {
    mkdirSync(dirname(target.file), { recursive: true })
    startOverIfLarge(target.file)
    // Owner-only: errors can carry file paths and server replies
    appendFileSync(
      target.file,
      `${JSON.stringify({ time: new Date().toISOString(), level, msg: message, ...fields })}\n`,
      {
        mode: 0o600
      }
    )
  } catch {
    // Logging must never break the app, and the Ink UI can't take console output.
  }
}

/** JSON-lines log file (see {@link logTarget}): warnings and errors by default, and never the terminal (Ink owns it). */
export const log = Object.fromEntries(
  LEVELS.map(level => [level, (message: string, payload?: Record<string, unknown>) => write(level, message, payload)])
) as Record<LogLevel, (message: string, payload?: Record<string, unknown>) => void>
