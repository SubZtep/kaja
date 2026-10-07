import { join } from "node:path"
import { getConfigDir, readConfigLoose } from "../config/config"
import { syncedAbilityPaths } from "./sync"

/** Where `kaja abilities update` fetches from unless settings.toml's `[marketplace]` says otherwise: this repo's marketplace/ folder on main. */
export const DEFAULT_SOURCE = { url: "https://github.com/SubZtep/kaja.git", ref: "main" }

/** Holds every ability and persona, synced from the marketplace or your own; all of them load, and personas pick the abilities a chat uses. */
export function getMarketplaceDir() {
  return join(getConfigDir(), "marketplace")
}

/** Your own abilities and personas: in the marketplace folder but not written by the sync. Broken ones are listed too. */
export async function ownAbilities(root = getMarketplaceDir()): Promise<{ abilities: string[]; personas: string[] }> {
  const { scanCodeTools, scanHttpTools, scanMcpAbilities, scanPersonas, scanSkills } = await import("@kaja/nasi")
  const synced = await syncedAbilityPaths(root)
  const names = [
    ...(await scanSkills(root)),
    ...(await scanHttpTools(root)),
    ...(await scanMcpAbilities(root)),
    ...(await scanCodeTools(root)).map(name => ({ name }))
  ].map(entry => entry.name)
  return {
    abilities: [...new Set(names)].filter(name => !synced.has(`abilities/${name}`)).sort((a, b) => a.localeCompare(b)),
    personas: (await scanPersonas(root)).map(s => s.name).filter(name => !synced.has(`personas/${name}.toml`))
  }
}

/** settings.toml's `[marketplace]`: both switches on unless turned off, and where to fetch from. Tolerant of a broken file, like the wizard prefill. */
export async function marketplaceSettings(): Promise<{
  enabled: boolean
  autoFetch: boolean
  source: { url: string; ref: string }
}> {
  const { marketplace } = await readConfigLoose()
  const enabled = marketplace?.enabled !== false
  return {
    enabled,
    autoFetch: enabled && marketplace?.autoFetch !== false,
    source: { url: marketplace?.url ?? DEFAULT_SOURCE.url, ref: marketplace?.ref ?? DEFAULT_SOURCE.ref }
  }
}
