import type { Tool } from "../agent/tools"
import { warn } from "../warn"

function isTool(value: unknown): value is Tool {
  return (
    typeof value === "object" &&
    value !== null &&
    "definition" in value &&
    "execute" in value &&
    typeof (value as Tool).execute === "function"
  )
}

/** Every export of an ability's `tool.ts` with a `definition` and an `execute` function; a file that fails to import loads none, with a warning. */
export async function loadCodeTool(path: string): Promise<Tool[]> {
  try {
    const exports: Record<string, unknown> = await import(path)
    return Object.values(exports).filter(isTool)
  } catch (error) {
    warn("Failed to load code tool", { path, error: error instanceof Error ? error.message : error })
    return []
  }
}
