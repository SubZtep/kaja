import { join } from "node:path"
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

/** Loads user-supplied tools from `dir/*.ts`, each tagged with its `plugin:<file>` source. */
export async function loadPluginTools(dir: string): Promise<Tool[]> {
  const glob = new Bun.Glob("*.ts")
  const tools: Tool[] = []
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
        if (isTool(value)) tools.push({ ...value, source: `plugin:${entry}` })
      }
    } catch (error) {
      warn("Failed to load plugin tool", { path, error: error instanceof Error ? error.message : error })
    }
  }
  return tools
}
