import { join } from "node:path"
import { loadPluginTools as nasiLoadPluginTools } from "@kaja/nasi"
import { getConfigDir } from "../config/config"

export async function loadPluginTools() {
  return nasiLoadPluginTools(join(getConfigDir(), "tools"))
}
