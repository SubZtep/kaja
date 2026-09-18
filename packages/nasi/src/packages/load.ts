import { warn } from "@kaja/logger"
import type { Persona } from "@kaja/schema/cli"
import type { HttpToolPackage } from "@kaja/schema/packages"
import type { ToolGroup } from "../tools/registry"
import { createHttpTools } from "./http-tool"
import { createLoadSkillTool } from "./skills"
import type { PackageStore, SkillSummary } from "./types"

/** What a host's enabled packages add to an agent. Each package type adds its own field. */
export type LoadedPackages = {
  /** Tool groups for `createTools`' `extraTools`, so package tools go through the same name rules as every other tool. */
  groups: ToolGroup[]
  skills: SkillSummary[]
  /** Enabled HTTP tool packages that loaded (their tools are in `groups`). */
  httpTools: HttpToolPackage[]
  /** Enabled HTTP tool packages left out because their key is missing. */
  missingKeys: string[]
}

export type LoadPackagesOptions = {
  personas?: Persona[]
  /** The package's key from wherever the host keeps secrets (secrets.toml's [packages.<name>] in the CLI). */
  getApiKey?: (packageName: string) => string | undefined
  /** Let HTTP tools reach private/loopback hosts. Local mode only. */
  allowPrivate?: boolean
}

/**
 * Turns a store's enabled packages into agent tool groups, one handler per package type
 * (skills, HTTP tools). A store that fails outright loads nothing, with a warning, so a broken
 * package folder never stops the agent from starting.
 */
export async function loadPackages(store: PackageStore, opts: LoadPackagesOptions = {}): Promise<LoadedPackages> {
  let skills: SkillSummary[] = []
  try {
    skills = await store.listSkills()
  } catch (error) {
    warn("Failed to list skills", { error: error instanceof Error ? error.message : error })
  }
  let packages: HttpToolPackage[] = []
  try {
    packages = await store.listHttpTools()
  } catch (error) {
    warn("Failed to list HTTP tools", { error: error instanceof Error ? error.message : error })
  }

  // load_skill is Kaja's own mechanism, so it's official (and its name reserved) even though packages switch it on.
  const groups: ToolGroup[] =
    skills.length > 0
      ? [{ origin: "official", tools: [createLoadSkillTool({ store, skills, personas: opts.personas })] }]
      : []

  const httpTools: HttpToolPackage[] = []
  const missingKeys: string[] = []
  for (const pkg of packages) {
    const apiKey = pkg.auth.type === "apiKey" ? opts.getApiKey?.(pkg.name) : undefined
    if (pkg.auth.type === "apiKey" && !apiKey) {
      warn("HTTP tool package left out: no API key", { package: pkg.name, secret: `[packages.${pkg.name}] apiKey` })
      missingKeys.push(pkg.name)
      continue
    }
    httpTools.push(pkg)
    groups.push({
      origin: "community",
      source: `package:${pkg.name}`,
      tools: createHttpTools(pkg, { apiKey, allowPrivate: opts.allowPrivate })
    })
  }

  return { groups, skills, httpTools, missingKeys }
}
