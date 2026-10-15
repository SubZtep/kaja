import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { McpRunnerMissingError, parseMcpManifest, resolveLaunch, scanMcpAbilities } from "@kaja/nasi"
import { McpAbilityOverridesSchema } from "@kaja/schema/abilities"

/** What the sandbox starts for one ability: always from its own manifests, never from a request. */
export type SandboxServer = {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  /** A keyed server's key: the env var it goes in (after `prefix`), and whether it starts without one. A request only brings the value. */
  key?: { env: string; prefix: string; keyless: boolean }
}

// A keyed manifest's `key` field; none for one without a key.
function serverKey(ability: ReturnType<typeof parseMcpManifest>): Pick<SandboxServer, "key"> {
  if (ability.auth.type !== "apiKey") return {}
  return { key: { env: ability.auth.name, prefix: ability.auth.prefix ?? "", keyless: ability.auth.keyless } }
}

/**
 * The stdio servers in `<marketplaceDir>/abilities/<name>/mcp.toml` the sandbox may run: a fixed `tools` list (a key, if it
 * takes one, comes with each request), and not local-only (`localOnly`, or `roots`: the user's own folders), the same rule the API offers them by. A package runs through the first runner the image has, never bun's own
 * (its cache can't be shared between uids, so npm packages go through npx). `overridesPath` swaps a server's command/args for
 * this host; `cacheDir` points every server's bun/uv/npm caches there, since each one's HOME is thrown away.
 */
export async function loadSandboxServers(
  marketplaceDir: string,
  overridesPath?: string,
  cacheDir?: string
): Promise<Map<string, SandboxServer>> {
  const overrides = overridesPath
    ? McpAbilityOverridesSchema.parse(JSON.parse(await readFile(overridesPath, "utf8")))
    : {}
  const cacheEnv: Record<string, string> = cacheDir
    ? {
        BUN_INSTALL_CACHE_DIR: join(cacheDir, "bun"),
        UV_CACHE_DIR: join(cacheDir, "uv"),
        UV_PYTHON_INSTALL_DIR: join(cacheDir, "python"),
        npm_config_cache: join(cacheDir, "npm")
      }
    : {}
  const entries = (await scanMcpAbilities(marketplaceDir)).filter(entry => !entry.error && entry.transport === "stdio")
  const texts = await Promise.all(
    entries.map(entry => readFile(join(resolve(marketplaceDir), "abilities", entry.name, "mcp.toml"), "utf8"))
  )
  const servers = new Map<string, SandboxServer>()
  for (const [index, entry] of entries.entries()) {
    const ability = parseMcpManifest(texts[index]!, entry.name)
    if (!ability.tools?.length || ability.localOnly || ability.roots) {
      console.warn("Sandbox skips MCP ability", { ability: ability.name })
      continue
    }
    const override = overrides[ability.name]
    const args = override?.args ?? ability.args
    const env = { ...cacheEnv, ...ability.env }
    try {
      const launch = override?.command
        ? { command: override.command, args, env }
        : resolveLaunch({ ...ability, args }, env, { self: false })
      servers.set(ability.name, { name: ability.name, ...launch, ...serverKey(ability) })
    } catch (error) {
      if (!(error instanceof McpRunnerMissingError)) throw error
      console.warn("Sandbox skips MCP ability: nothing here can start it", {
        ability: ability.name,
        needs: error.needs
      })
    }
  }
  return servers
}
