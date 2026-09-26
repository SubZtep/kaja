import type { McpAbility, McpReadOnlyRule } from "@kaja/schema/abilities"
import type { McpServerEntry } from "@kaja/schema/config"
import { trimTrailingSlashes } from "@kaja/shared"
import { connectMcpServer } from "../mcp/client"
import type { FetchLike } from "../security/ssrf"
import type { KeyCheckResult } from "./http-tool"

const CHECK_TIMEOUT_MS = 15_000

/** An enabled MCP ability ready to connect: its server entry (key folded in) plus how to treat its tools. */
export type McpAbilityTarget = {
  name: string
  server: McpServerEntry
  transport: McpAbility["transport"]
  approval: McpAbility["approval"]
  allow?: string[]
  readOnly?: McpReadOnlyRule[]
  /** Arguments the cloud hides from the model (the manifest's `localOnlyArgs`). */
  localOnlyArgs?: string[]
  /** A stdio ability the host's MCP sandbox runs for it, reached over Streamable HTTP. */
  sandboxed?: boolean
}

/** The host's MCP sandbox (apps/sandbox): where it is, and a bearer token for the caller and one ability. */
export type McpSandbox = { url: string; token: (abilityName: string) => Promise<string> }

/** The ability as a connectable server: static headers/env, plus the key (with its prefix) in the header or env var `auth` names. */
export function mcpAbilityTarget(ability: McpAbility, apiKey?: string): McpAbilityTarget {
  const value = ability.auth.type === "apiKey" && apiKey ? `${ability.auth.prefix ?? ""}${apiKey}` : undefined
  const keyEntry = value && ability.auth.type === "apiKey" ? { [ability.auth.name]: value } : {}
  const server: McpServerEntry =
    ability.transport === "stdio"
      ? { id: ability.name, command: ability.command!, args: ability.args, env: { ...ability.env, ...keyEntry } }
      : { id: ability.name, url: ability.url!, headers: { ...ability.headers, ...keyEntry } }
  const readOnly = ability.readOnly?.map(rule => (typeof rule === "string" ? { tool: rule, unless: [] } : rule))
  return {
    name: ability.name,
    server,
    transport: ability.transport,
    approval: ability.approval,
    allow: ability.tools,
    ...(readOnly ? { readOnly } : {}),
    ...(ability.localOnlyArgs?.length ? { localOnlyArgs: ability.localOnlyArgs } : {})
  }
}

/**
 * A stdio ability as the sandbox serves it: `<sandbox>/mcp/<name>` over Streamable HTTP with the caller's token.
 * The sandbox starts the command from its own copy of the manifest, so none of it is sent; nor is a key (not forwarded yet).
 */
export async function sandboxedMcpTarget(ability: McpAbility, sandbox: McpSandbox): Promise<McpAbilityTarget> {
  const local = mcpAbilityTarget(ability)
  const url = `${trimTrailingSlashes(sandbox.url)}/mcp/${encodeURIComponent(ability.name)}`
  return {
    ...local,
    server: { id: ability.name, url, headers: { Authorization: `Bearer ${await sandbox.token(ability.name)}` } },
    transport: "http",
    sandboxed: true
  }
}

/** Connects to the ability's server with `apiKey` and lists its tools, then disconnects: it works, or why not (the key never appears in the reason). */
export async function checkMcpAbilityKey(
  ability: McpAbility,
  apiKey: string,
  opts: { fetch?: FetchLike; timeoutMs?: number } = {}
): Promise<KeyCheckResult> {
  const target = mcpAbilityTarget(ability, apiKey)
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
