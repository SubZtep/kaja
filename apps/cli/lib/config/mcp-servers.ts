import { join } from "node:path"
import { type KajaMcpFile, McpFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// First-run mcp.toml template (also documents mcp.toml on the docs site).
import TEMPLATE from "../../../../docs/config/mcp.toml" with { type: "text" }
import { t } from "../i18n"
import { getConfigDir } from "./config"
import { fetchTomlConfig } from "./fetch"
import { secrets } from "./secrets"

export function getMcpPath() {
  return join(getConfigDir(), "mcp.toml")
}

/** The `kaja config fetch` subcommand: downloads the server-rendered mcp.toml and writes it to the local config dir, backing up any existing file first. */
export async function fetchMcpToml(apiBaseUrl: string, token?: string): Promise<{ path: string; backedUpTo?: string }> {
  return fetchTomlConfig(apiBaseUrl, "/config/mcp.toml", getMcpPath(), token)
}

/** Loads the MCP servers file, then folds in secrets.toml's [mcp.<id>] table into each server's env (stdio) or headers (HTTP) by key name. Missing file: writes the example template and returns its active servers. Invalid file: prints the error and exits, same policy as {@link config}. */
export async function loadMcpServers(): Promise<KajaMcpFile["servers"]> {
  const mcpPath = getMcpPath()
  const f = file(mcpPath)
  // Parse TEMPLATE directly rather than reading it back: a freshly written BunFile can report stale (empty) content on an immediate re-read.
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  const text = exists ? await f.text() : TEMPLATE
  try {
    const { servers } = McpFileSchema.parse(TOML.parse(text))
    const { mcp: mcpSecrets } = await secrets()
    return servers.map(server => {
      const creds = mcpSecrets[server.id]
      if (!creds) return server
      return "url" in server
        ? { ...server, headers: { ...server.headers, ...creds } }
        : { ...server, env: { ...server.env, ...creds } }
    })
  } catch (error: any) {
    console.log(t("mcp.invalidAt", { path: mcpPath, message: error.message }))
    process.exit(1)
  }
}
