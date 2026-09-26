import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { parseMcpManifest, scanMcpAbilities } from "@kaja/nasi"
import { McpAbilityOverridesSchema } from "@kaja/schema/abilities"

/** What the sandbox starts for one ability: always from its own manifests, never from a request. */
export type SandboxServer = { name: string; command: string; args: string[]; env: Record<string, string> }

/**
 * The stdio servers under `<marketplaceDir>/mcp` the sandbox may run: a fixed `tools` list and no key (keys aren't
 * forwarded yet), the same rule the API offers them by. `overridesPath` swaps a server's command/args for this host;
 * `cacheDir` points every server's bun/uv/npm caches there, since each one's HOME is thrown away.
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
  const servers = new Map<string, SandboxServer>()
  for (const entry of await scanMcpAbilities(marketplaceDir)) {
    if (entry.error || entry.transport !== "stdio") continue
    const text = await readFile(join(resolve(marketplaceDir), "mcp", `${entry.name}.toml`), "utf8")
    const ability = parseMcpManifest(text, entry.name)
    if (!ability.tools?.length || ability.auth.type !== "none" || !ability.command) {
      console.warn("Sandbox skips MCP ability", { ability: ability.name })
      continue
    }
    const override = overrides[ability.name]
    servers.set(ability.name, {
      name: ability.name,
      command: override?.command ?? ability.command,
      args: override?.args ?? ability.args,
      env: { ...cacheEnv, ...ability.env }
    })
  }
  return servers
}
