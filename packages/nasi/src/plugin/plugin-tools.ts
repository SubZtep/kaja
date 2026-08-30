import { join } from "node:path"
import { warn } from "@kaja/logger"
import type { Tool } from "../agent/tools"

function isTool(value: unknown): value is Tool<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    "definition" in value &&
    "execute" in value &&
    typeof (value as Tool<any>).execute === "function"
  )
}

/**
 * Loads user-supplied tools from `dir/*.ts`. Hosted must never call this.
 */
export async function loadPluginTools(dir: string): Promise<Tool<any>[]> {
  const glob = new Bun.Glob("*.ts")
  const tools: Tool<any>[] = []
  let entries: string[]
  try {
    entries = []
    for await (const match of glob.scan({ cwd: dir, dot: false })) {
      entries.push(match)
    }
  } catch {
    return tools
  }
  for (const entry of entries.toSorted((a, b) => a.localeCompare(b))) {
    const path = join(dir, entry)
    try {
      const exports: Record<string, unknown> = await import(path)
      for (const value of Object.values(exports)) {
        if (isTool(value)) tools.push(value)
      }
    } catch (error) {
      warn("Failed to load plugin tool", { path, error: error instanceof Error ? error.message : error })
    }
  }
  return tools
}
