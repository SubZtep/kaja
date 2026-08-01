import { join } from "node:path"
import { file, TOML, write } from "bun"
// Written on first run: a ready-to-use example server (Playwright) plus
// commented-out alternatives, sourced from the same file that documents
// mcp.toml on the docs site.
import TEMPLATE from "../../../docs/config/mcp.toml" with { type: "text" }
import { type KajaMcpFile, McpFileSchema } from "../schemas/mcp"
import { getConfigDir } from "./config"
import { t } from "./i18n"

export function getMcpPath() {
  return join(getConfigDir(), "mcp.toml")
}

/**
 * First non-existent path among mcp.toml.bak, mcp.toml.bak2, mcp.toml.bak3,
 * ... so `kaja config fetch` never clobbers a previous backup.
 */
async function nextBackupPath(mcpPath: string): Promise<string> {
  let suffix = ""
  let n = 1
  while (await file(`${mcpPath}.bak${suffix}`).exists()) {
    n += 1
    suffix = String(n)
  }
  return `${mcpPath}.bak${suffix}`
}

/**
 * The `kaja config fetch` subcommand: downloads the server-rendered
 * mcp.toml from the Kaja API and writes it to the local config dir. An
 * existing file is renamed to .bak (.bak2, .bak3, ...) rather than
 * overwritten in place, so a bad fetch is always recoverable.
 */
export async function fetchMcpToml(apiBaseUrl: string): Promise<{ path: string; backedUpTo?: string }> {
  const url = new URL("/config/mcp.toml", apiBaseUrl)
  const res = await fetch(url)
  if (!res.ok) throw new Error(t("config.fetchFailed", { status: String(res.status) }))
  const toml = await res.text()

  const mcpPath = getMcpPath()
  const f = file(mcpPath)
  let backedUpTo: string | undefined
  if (await f.exists()) {
    backedUpTo = await nextBackupPath(mcpPath)
    await write(backedUpTo, f)
  }
  await write(mcpPath, toml)
  return { path: mcpPath, backedUpTo }
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
