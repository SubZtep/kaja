import type { McpServerEntry } from "@kaja/schema/config"
import type { McpPackage, McpReadOnlyRule } from "@kaja/schema/packages"
import { connectMcpServer } from "../mcp/client"
import type { FetchLike } from "../security/ssrf"
import type { KeyCheckResult } from "./http-tool"

const CHECK_TIMEOUT_MS = 15_000

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

/** Connects to the package's server with `apiKey` and lists its tools, then disconnects: it works, or why not (the key never appears in the reason). */
export async function checkMcpPackageKey(
  pkg: McpPackage,
  apiKey: string,
  opts: { fetch?: FetchLike; timeoutMs?: number } = {}
): Promise<KeyCheckResult> {
  const target = mcpPackageTarget(pkg, apiKey)
  const timeoutMs = opts.timeoutMs ?? CHECK_TIMEOUT_MS
  const pending = connectMcpServer(target.server, "", {
    transport: target.transport === "sse" ? "sse" : "http",
    fetch: opts.fetch,
    images: false
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)
  })
  try {
    const connection = await Promise.race([pending, timeout])
    await connection.close()
    return { ok: true }
  } catch (error) {
    pending.then(late => late.close()).catch(() => {})
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: message.replaceAll(apiKey, "•••") }
  } finally {
    clearTimeout(timer)
  }
}
