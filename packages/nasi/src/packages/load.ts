import { warn } from "@kaja/logger"
import type { Persona } from "@kaja/schema/cli"
import type { HttpToolPackage, McpPackage } from "@kaja/schema/packages"
import type { ToolGroup } from "../tools/registry"
import { createHttpTools } from "./http-tool"
import { type McpPackageTarget, mcpPackageTarget } from "./mcp-package"
import { createLoadSkillTool } from "./skills"
import type { PackageStore, SkillSummary } from "./types"

/** What a host's enabled packages add to an agent. Each package type adds its own field. */
export type LoadedPackages = {
  /** Tool groups for `createTools`' `extraTools`, so package tools go through the same name rules as every other tool. */
  groups: ToolGroup[]
  skills: SkillSummary[]
  /** Enabled HTTP tool packages that loaded (their tools are in `groups`). */
  httpTools: HttpToolPackage[]
  /** Enabled MCP packages ready to connect — hand them to `createTools`' `mcpPackages`, which connects them with the other servers. */
  mcp: McpPackageTarget[]
  /** Enabled packages left out because their (required) key is missing. */
  missingKeys: string[]
}

export type LoadPackagesOptions = {
  personas?: Persona[]
  /** The package's key from wherever the host keeps secrets (secrets.toml's [packages.<name>] in the CLI). */
  getApiKey?: (packageName: string) => string | undefined
  /** Let HTTP tools reach private/loopback hosts. Local mode only. */
  allowPrivate?: boolean
  /** HTTP(S) proxy HTTP tools egress through (the cloud's WEB_PROXY); unset goes direct. */
  proxy?: string
}

/**
 * Turns a store's enabled packages into agent tool groups, one handler per package type
 * (skills, HTTP tools, MCP servers). A store that fails outright loads nothing, with a warning, so a broken
 * package folder never stops the agent from starting.
 */
export async function loadPackages(store: PackageStore, opts: LoadPackagesOptions = {}): Promise<LoadedPackages> {
  const skills = await listOrWarn(() => store.listSkills(), "skills")
  const packages = await listOrWarn(() => store.listHttpTools(), "HTTP tools")
  const mcpPackages = await listOrWarn(() => store.listMcpPackages(), "MCP packages")

  // load_skill is Kaja's own mechanism, so it's official (and its name reserved) even though packages switch it on.
  const groups: ToolGroup[] =
    skills.length > 0
      ? [{ origin: "official", tools: [createLoadSkillTool({ store, skills, personas: opts.personas })] }]
      : []

  const missingKeys: string[] = []
  /** The package's key, or null when a required one is missing (the package is then left out). */
  const keyFor = (pkg: HttpToolPackage | McpPackage): string | undefined | null => {
    if (pkg.auth.type !== "apiKey") return undefined
    const apiKey = opts.getApiKey?.(pkg.name)
    if (apiKey || pkg.auth.optional) return apiKey
    warn("Package left out: no API key", { package: pkg.name, secret: `[packages.${pkg.name}] apiKey` })
    missingKeys.push(pkg.name)
    return null
  }

  const httpTools: HttpToolPackage[] = []
  for (const pkg of packages) {
    const apiKey = keyFor(pkg)
    if (apiKey === null) continue
    httpTools.push(pkg)
    groups.push({
      origin: "community",
      source: `package:${pkg.name}`,
      tools: createHttpTools(pkg, { apiKey, allowPrivate: opts.allowPrivate, proxy: opts.proxy })
    })
  }

  const mcp: McpPackageTarget[] = []
  for (const pkg of mcpPackages) {
    const apiKey = keyFor(pkg)
    if (apiKey !== null) mcp.push(mcpPackageTarget(pkg, apiKey))
  }

  return { groups, skills, httpTools, mcp, missingKeys }
}

// A list the store can't read counts as empty, with a warning, so one broken package type doesn't stop the others.
async function listOrWarn<T>(list: () => Promise<T[]>, what: string): Promise<T[]> {
  try {
    return await list()
  } catch (error) {
    warn(`Failed to list ${what}`, { error: error instanceof Error ? error.message : error })
    return []
  }
}
