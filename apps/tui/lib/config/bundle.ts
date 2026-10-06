import { join } from "node:path"
import { getConfigDir } from "./config"

const BUNDLE_FILES = new Set(["models.toml", "commands.toml"])

/** The server bundle's files that `fetch` writes; personas and MCP servers, like the rest of the marketplace, come from `kaja abilities update`. */
export function pickBundleFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([key]) => BUNDLE_FILES.has(key)))
}

/** Maps a bundle file key ("models.toml") to its on-disk path under the config dir. */
export function pathForBundleKey(key: string): string {
  return join(getConfigDir(), key)
}
