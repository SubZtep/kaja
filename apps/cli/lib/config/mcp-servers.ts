import { join } from "node:path"
import { type KajaMcpFile, McpFileSchema } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// First-run mcp.toml template (also documents mcp.toml on the docs site).
import TEMPLATE from "../../../../docs/config/mcp.toml" with { type: "text" }
import { t } from "../i18n"
import { getConfigDir } from "./config"
import { fetchTomlConfig } from "./fetch"

export function getMcpPath() {
  return join(getConfigDir(), "mcp.toml")
}

/**
 * The `kaja config fetch` subcommand: downloads the server-rendered
 * mcp.toml from the Kaja API and writes it to the local config dir. An
 * existing file is renamed to .bak (.bak2, .bak3, ...) rather than
 * overwritten in place, so a bad fetch is always recoverable.
 */
export async function fetchMcpToml(apiBaseUrl: string, token?: string): Promise<{ path: string; backedUpTo?: string }> {
  return fetchTomlConfig(apiBaseUrl, "/config/mcp.toml", getMcpPath(), token)
}

/**
 * Load the MCP servers file. Missing file: writes the example template and
 * returns its active servers. Invalid file: prints the error and exits, same
 * policy as {@link config}.
 */
export async function loadMcpServers(): Promise<KajaMcpFile["servers"]> {
  const mcpPath = getMcpPath()
  const f = file(mcpPath)
  // Parse TEMPLATE directly rather than reading it back: a freshly written
  // BunFile can report stale (empty) content on an immediate re-read.
  const exists = await f.exists()
  if (!exists) await write(f, TEMPLATE)
  const text = exists ? await f.text() : TEMPLATE
  try {
    return McpFileSchema.parse(TOML.parse(text)).servers
  } catch (error: any) {
    console.log(t("mcp.invalidAt", { path: mcpPath, message: error.message }))
    process.exit(1)
  }
}
