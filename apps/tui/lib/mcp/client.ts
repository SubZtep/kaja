import { connectMcpServer as nasiConnect } from "@kaja/nasi"
import type { McpServerEntry } from "@kaja/schema/config"
import { getPaths } from "../paths"

export async function connectMcpServer(server: McpServerEntry) {
  return nasiConnect(server, getPaths().temp)
}
