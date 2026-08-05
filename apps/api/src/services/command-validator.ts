import { warn } from "@kaja/logger"
import type { CreateCommandRequest } from "@kaja/schema"

/**
 * Allowlist of permitted commands
 *
 * Only these commands can be executed on nodes for security.
 * Each command should be carefully reviewed before adding.
 */
const ALLOWED_COMMANDS = new Set([
  "echo",
  "ping",
  "uptime",
  "whoami",
  "hostname",
  "date",
  "pwd",
  "ls",
  "df",
  "free",
  "uname",
  "ps"
])

/** Characters / sequences that enable shell metacharacter abuse if args are interpolated. */
const SHELL_INJECTION_CHARS = [";", "|", "&", "`", "$", "(", ")", "<", ">", "\n", "\r", "\0"] as const

/**
 * Check a single arg value for dangerous shell injection characters
 *
 * @returns Error message if invalid, null if valid
 */
function validateArgValue(key: string, value: unknown): string | null {
  if (typeof value !== "string") return null

  const hasInjectionChar = SHELL_INJECTION_CHARS.some(char => value.includes(char))
  if (!hasInjectionChar) return null

  warn("Rejected command with shell injection attempt", { key, value })
  return `Argument '${key}' contains potentially dangerous characters`
}

/**
 * Validate args for dangerous shell injection patterns
 *
 * @param args The args object to validate
 * @returns Error message if invalid, null if valid
 */
function validateArgs(args: NonNullable<CreateCommandRequest["args"]>): string | null {
  if (typeof args !== "object" || Array.isArray(args)) {
    return "Args must be a plain object"
  }

  for (const [key, value] of Object.entries(args)) {
    const error = validateArgValue(key, value)
    if (error) return error
  }

  return null
}

/**
 * Validate that the command is in the allowlist
 *
 * @returns Error message if invalid, null if valid
 */
function validateAllowlist(command: string): string | null {
  if (ALLOWED_COMMANDS.has(command)) return null

  warn("Rejected non-allowlisted command", { command })
  return `Command '${command}' is not permitted. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(", ")}`
}

/**
 * Validate that the timeout is within the permitted range
 *
 * @returns Error message if invalid, null if valid
 */
function validateTimeout(timeoutSeconds: number | undefined): string | null {
  if (timeoutSeconds === undefined) return null
  if (timeoutSeconds >= 1 && timeoutSeconds <= 3600) return null

  return "Timeout must be between 1 and 3600 seconds"
}

/**
 * Validate a command request for security
 *
 * @param request The command request to validate
 * @returns Error message if invalid, null if valid
 */
export function validateCommand(request: CreateCommandRequest): string | null {
  return (
    validateAllowlist(request.command) ??
    validateTimeout(request.timeoutSeconds) ??
    (request.args ? validateArgs(request.args) : null)
  )
}
