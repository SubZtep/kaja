import { join } from "node:path"
import { type AbilitiesFile, AbilitiesFileSchema, type AbilitiesSource } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
import { getConfigDir, readConfigLoose } from "../config/config"
import { t } from "../i18n"
import { syncedAbilityPaths } from "./sync"

/** Where `kaja abilities update` fetches from unless abilities.toml's [source] says otherwise: this repo's marketplace/ folder on main. */
export const DEFAULT_SOURCE: Required<AbilitiesSource> = { url: "https://github.com/SubZtep/kaja.git", ref: "main" }

export function resolveSource(source: AbilitiesSource | undefined): Required<AbilitiesSource> {
  return { url: source?.url ?? DEFAULT_SOURCE.url, ref: source?.ref ?? DEFAULT_SOURCE.ref }
}

export function getAbilitiesPath() {
  return join(getConfigDir(), "abilities.toml")
}

/** Holds every ability, synced from the marketplace or your own; abilities.toml decides which of them load. */
export function getMarketplaceDir() {
  return join(getConfigDir(), "marketplace")
}

/** Your own skills and personas: in the marketplace folder but not written by the sync, so they load without an abilities.toml entry (rename or move one to switch it off). Broken ones are listed too, so loading them warns. */
export async function ownAbilities(root = getMarketplaceDir()): Promise<{ skills: string[]; personas: string[] }> {
  const { scanPersonas, scanSkills } = await import("@kaja/nasi")
  const synced = await syncedAbilityPaths(root)
  return {
    skills: (await scanSkills(root)).map(s => s.name).filter(name => !synced.has(`abilities/${name}`)),
    personas: (await scanPersonas(root)).map(s => s.name).filter(name => !synced.has(`personas/${name}.toml`))
  }
}

/** settings.toml's `[marketplace]`, both switches on unless turned off. Tolerant of a broken file, like the wizard prefill. */
export async function marketplaceSettings(): Promise<{ enabled: boolean; autoFetch: boolean }> {
  const { marketplace } = await readConfigLoose()
  const enabled = marketplace?.enabled !== false
  return { enabled, autoFetch: enabled && marketplace?.autoFetch !== false }
}

/** Loads abilities.toml. Missing file: nothing enabled, and no file is written (it's opt-in). Invalid file: prints the error and exits, same policy as {@link import("../config/mcp-servers").loadMcpServers}. */
export async function loadAbilitiesFile(): Promise<AbilitiesFile> {
  const path = getAbilitiesPath()
  const f = file(path)
  if (!(await f.exists())) return AbilitiesFileSchema.parse({})
  try {
    return AbilitiesFileSchema.parse(TOML.parse(await f.text()))
  } catch (error) {
    console.log(t("abilities.invalidAt", { path, message: error instanceof Error ? error.message : String(error) }))
    process.exit(1)
  }
}

/** Writes the enabled lists to abilities.toml, keeping [source] and any keys this version doesn't know. Only `kaja abilities` calls this. */
export async function saveAbilitiesFile(
  update: Partial<Pick<AbilitiesFile, "skills" | "tools" | "mcp" | "personas" | "disabledTools">>
): Promise<void> {
  const path = getAbilitiesPath()
  const f = file(path)
  const current = (await f.exists()) ? (TOML.parse(await f.text()) as Record<string, unknown>) : {}
  await write(path, TOML.stringify({ ...current, ...update })!)
}
