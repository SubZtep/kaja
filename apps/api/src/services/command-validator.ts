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
    if (typeof value !== "string") continue

    // Check for shell injection attempts
    if (value.includes(";") || value.includes("|") || value.includes("&") || value.includes("`")) {
      warn("Rejected command with shell injection attempt", { key, value })
      return `Argument '${key}' contains potentially dangerous characters`
    }
  }

  return null
}

/**
 * Validate a command request for security
 *
 * @param request The command request to validate
 * @returns Error message if invalid, null if valid
 */
export function validateCommand(request: CreateCommandRequest): string | null {
  // Check if command is in allowlist
  if (!ALLOWED_COMMANDS.has(request.command)) {
    warn("Rejected non-allowlisted command", { command: request.command })
    return `Command '${request.command}' is not permitted. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(", ")}`
  }

  // Validate timeout
  if (request.timeoutSeconds !== undefined && (request.timeoutSeconds < 1 || request.timeoutSeconds > 3600)) {
    return "Timeout must be between 1 and 3600 seconds"
  }

  // Validate args if present
  if (request.args) {
    return validateArgs(request.args)
  }

  return null
}
