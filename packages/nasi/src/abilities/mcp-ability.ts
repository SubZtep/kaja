import type { McpAbility, McpReadOnlyRule } from "@kaja/schema/abilities"
import type { McpServerEntry } from "@kaja/schema/config"
import { connectMcpServer } from "../mcp/client"
import { type LaunchOptions, resolveLaunch } from "../mcp/launch"
import type { RootFolder } from "../mcp/roots"
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
  /** A roots-taking server's folders by persona id (real paths, each list non-empty); a persona not here gets it off. */
  roots?: Record<string, RootFolder[]>
  /** Tool arguments that hold paths (the manifest's `pathArgs`), checked against read-only roots. */
  pathArgs?: string[]
}

/**
 * The host's MCP sandboxes (apps/sandbox): a `fetch` that takes `<SANDBOX_ORIGIN>/mcp/<ability>` requests to one
 * serving the caller, and a `close` the instance calls after its own MCP connections close (the turn is over).
 */
export type McpSandbox = { fetch: FetchLike; close?: () => Promise<void> }

/** The origin sandboxed abilities' URLs are given: never looked up, only routed to {@link McpSandbox.fetch}. */
export const SANDBOX_ORIGIN = "https://sandbox.invalid"

/**
 * The ability as a connectable server: static headers/env, plus the key (with its prefix) in the header or env var `auth`
 * names. A stdio one starts through `resolveLaunch` (with `launch`, and `roots`' folders for a container to mount), so it
 * throws `McpRunnerMissingError` when this host has nothing that can run it.
 */
export function mcpAbilityTarget(
  ability: McpAbility,
  apiKey?: string,
  launch?: LaunchOptions,
  roots?: Record<string, RootFolder[]>
): McpAbilityTarget {
  const value = ability.auth.type === "apiKey" && apiKey ? `${ability.auth.prefix ?? ""}${apiKey}` : undefined
  const keyEntry = value && ability.auth.type === "apiKey" ? { [ability.auth.name]: value } : {}
  const server: McpServerEntry =
    ability.transport === "stdio"
      ? { id: ability.name, ...resolveLaunch(ability, { ...ability.env, ...keyEntry }, launch, mountFolders(roots)) }
      : { id: ability.name, url: ability.url!, headers: { ...ability.headers, ...keyEntry } }
  return {
    ...targetRules(ability),
    server,
    transport: ability.transport,
    ...(roots ? { roots, ...(ability.pathArgs ? { pathArgs: ability.pathArgs } : {}) } : {})
  }
}

/** Every persona's folders, once each: what the server may ever be given. Read-only only where every persona says so. */
export function mountFolders(roots: Record<string, RootFolder[]> | undefined): RootFolder[] {
  const byFolder = new Map<string, boolean>()
  for (const root of Object.values(roots ?? {}).flat())
    byFolder.set(root.folder, (byFolder.get(root.folder) ?? true) && root.readOnly)
  return [...byFolder].map(([folder, readOnly]) => ({ folder, readOnly }))
}

// How the ability's tools are treated, wherever its server runs.
function targetRules(ability: McpAbility) {
  const readOnly = ability.readOnly?.map(rule => (typeof rule === "string" ? { tool: rule, unless: [] } : rule))
  return {
    name: ability.name,
    approval: ability.approval,
    allow: ability.tools,
    ...(readOnly ? { readOnly } : {}),
    ...(ability.localOnlyArgs?.length ? { localOnlyArgs: ability.localOnlyArgs } : {})
  }
}

/**
 * A stdio ability as a sandbox serves it: `<SANDBOX_ORIGIN>/mcp/<name>` over Streamable HTTP, through the sandbox's fetch.
 * The sandbox starts the command from its own copy of the manifest, so none of it is sent; nor is a key (not forwarded yet).
 */
export function sandboxedMcpTarget(ability: McpAbility): McpAbilityTarget {
  const url = `${SANDBOX_ORIGIN}/mcp/${encodeURIComponent(ability.name)}`
  return {
    ...targetRules(ability),
    server: { id: ability.name, url, headers: {} },
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
