import type { McpServerEntry } from "@kaja/schema/config"
import type { McpPackage, McpReadOnlyRule } from "@kaja/schema/packages"

/** An enabled MCP package ready to connect: its server entry (key folded in) plus how to treat its tools. */
export type McpPackageTarget = {
  name: string
  server: McpServerEntry
  transport: McpPackage["transport"]
  approval: McpPackage["approval"]
  allow?: string[]
  readOnly?: McpReadOnlyRule[]
}

/** The package as a connectable server: static headers/env, plus the key (with its prefix) in the header or env var `auth` names. */
export function mcpPackageTarget(pkg: McpPackage, apiKey?: string): McpPackageTarget {
  const value = pkg.auth.type === "apiKey" && apiKey ? `${pkg.auth.prefix ?? ""}${apiKey}` : undefined
  const keyEntry = value && pkg.auth.type === "apiKey" ? { [pkg.auth.name]: value } : {}
  const server: McpServerEntry =
    pkg.transport === "stdio"
      ? { id: pkg.name, command: pkg.command!, args: pkg.args, env: { ...pkg.env, ...keyEntry } }
      : { id: pkg.name, url: pkg.url!, headers: { ...pkg.headers, ...keyEntry } }
  const readOnly = pkg.readOnly?.map(rule => (typeof rule === "string" ? { tool: rule, unless: [] } : rule))
  return {
    name: pkg.name,
    server,
    transport: pkg.transport,
    approval: pkg.approval,
    allow: pkg.tools,
    ...(readOnly ? { readOnly } : {})
  }
}
