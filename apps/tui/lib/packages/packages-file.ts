import { join } from "node:path"
import { type PackagesFile, PackagesFileSchema } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { getConfigDir } from "../config/config"
import { t } from "../i18n"

export function getPackagesPath() {
  return join(getConfigDir(), "packages.toml")
}

/** Holds every package, synced from the marketplace or your own; packages.toml decides which of them load. */
export function getMarketplaceDir() {
  return join(getConfigDir(), "marketplace")
}

/** Loads packages.toml. Missing file: nothing enabled, and no file is written (it's opt-in). Invalid file: prints the error and exits, same policy as {@link import("../config/mcp-servers").loadMcpServers}. */
export async function loadPackagesFile(): Promise<PackagesFile> {
  const path = getPackagesPath()
  const f = file(path)
  if (!(await f.exists())) return PackagesFileSchema.parse({})
  try {
    return PackagesFileSchema.parse(TOML.parse(await f.text()))
  } catch (error: any) {
    console.log(t("packages.invalidAt", { path, message: error.message }))
    process.exit(1)
  }
}
