import { APIError } from "openai"
import { ToolError } from "./tools"

export type ErrorCategory = "network" | "tool" | "agent" | "unknown"

/** Classifies a run() error for a differentiated timeline message. */
export function categorizeError(error: unknown): {
  category: ErrorCategory
  message: string
} {
  if (error instanceof APIError) {
    return { category: "network", message: `LLM API: ${error.message}` }
  }
  if (error instanceof ToolError) {
    return { category: "tool", message: `${error.toolName}: ${error.message}` }
  }
  if (error instanceof Error) {
    return { category: "agent", message: error.message }
  }
  return { category: "unknown", message: String(error) }
}

/** Whether a turn sent with an image failed the way a model that can't view images fails: the provider refused the request itself (a 4xx other than auth, timeout or rate limit). */
export function isImageRejection(error: unknown): boolean {
  if (!(error instanceof APIError) || error.status === undefined) return false
  return error.status >= 400 && error.status < 500 && ![401, 403, 408, 429].includes(error.status)
}
