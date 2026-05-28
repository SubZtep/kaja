import type { CreateCommandRequest } from "@kaja/schemas"
import { logger } from "../../../core/logger"

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
 * Validate a command request for security
 *
 * @param request The command request to validate
 * @returns Error message if invalid, null if valid
 */
export function validateCommand(request: CreateCommandRequest): string | null {
  // Check if command is in allowlist
  if (!ALLOWED_COMMANDS.has(request.command)) {
    logger.warn({ command: request.command }, "Rejected non-allowlisted command")
    return `Command '${request.command}' is not permitted. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(", ")}`
  }

  // Validate timeout
  if (request.timeoutSeconds !== undefined) {
    if (request.timeoutSeconds < 1 || request.timeoutSeconds > 3600) {
      return "Timeout must be between 1 and 3600 seconds"
    }
  }

  // Validate args if present
  if (request.args) {
    if (typeof request.args !== "object" || Array.isArray(request.args)) {
      return "Args must be a plain object"
    }

    // Check for dangerous patterns in args values
    for (const [key, value] of Object.entries(request.args)) {
      if (typeof value === "string") {
        // Check for shell injection attempts
        if (value.includes(";") || value.includes("|") || value.includes("&") || value.includes("`")) {
          logger.warn({ key, value }, "Rejected command with shell injection attempt")
          return `Argument '${key}' contains potentially dangerous characters`
        }
      }
    }
  }

  return null
}
