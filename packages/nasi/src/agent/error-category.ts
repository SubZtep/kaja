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
