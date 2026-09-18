import { join } from "node:path"
import { type PackagesFile, PackagesFileSchema, type PackagesSource } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import { getConfigDir } from "../config/config"
import { t } from "../i18n"

/** Where `kaja pkg update` fetches from unless packages.toml's [source] says otherwise: this repo's marketplace/ folder on main. */
export const DEFAULT_SOURCE: Required<PackagesSource> = { url: "https://github.com/SubZtep/kaja.git", ref: "main" }

export function resolveSource(source: PackagesSource | undefined): Required<PackagesSource> {
  return { url: source?.url ?? DEFAULT_SOURCE.url, ref: source?.ref ?? DEFAULT_SOURCE.ref }
}

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

/** Writes the enabled lists to packages.toml, keeping [source] and any keys this version doesn't know. Only `kaja pkg` calls this. */
export async function savePackagesFile(update: Pick<PackagesFile, "skills">): Promise<void> {
  const path = getPackagesPath()
  const f = file(path)
  const current = (await f.exists()) ? (TOML.parse(await f.text()) as Record<string, unknown>) : {}
  await write(path, TOML.stringify({ ...current, ...update })!)
}
