import { toolName } from "./tools"

/** What a tool is called in an allow list: `<source>:<name>`, e.g. `ability:github:create_issue`. A tool with no source (a builtin) has none, and is never allow-listed. */
export function allowKey(tool: Parameters<typeof toolName>[0] & { source?: string }): string | undefined {
  return tool.source ? `${tool.source}:${toolName(tool)}` : undefined
}

/** Whether `key` matches one of `patterns`: exact, or with `*` standing for any run of characters. */
export function isAllowed(patterns: readonly string[] | undefined, key: string | undefined): boolean {
  if (!key || !patterns) return false
  return patterns.some(pattern =>
    pattern.includes("*")
      ? new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`).test(key)
      : pattern === key
  )
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
