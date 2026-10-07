import { existsSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { $ } from "bun"
import { getConfigDir, readConfigLoose } from "../config/config"
import { syncedAbilityPaths } from "./sync"

/** Where `kaja abilities update` fetches from unless settings.toml's `[marketplace]` says otherwise: this repo's marketplace/ folder on main. */
export const DEFAULT_SOURCE = { url: "https://github.com/SubZtep/kaja.git", ref: "main" }

// The checkout this CLI runs from (apps/tui/lib/abilities → the repo root); a compiled binary has none.
const REPO_ROOT = join(import.meta.dir, "../../../..")

/**
 * The default source under `KAJA_PROFILE=dev`: the checkout the CLI runs from, on its current branch, so even a first
 * start syncs the marketplace you're working on (committed changes only: it's fetched through git). Undefined for any
 * other profile, outside a source checkout, or on a detached HEAD.
 */
export async function devSource(root = REPO_ROOT): Promise<{ url: string; ref: string } | undefined> {
  if (Bun.env.KAJA_PROFILE !== "dev" || !existsSync(join(root, "marketplace"))) return undefined
  const ref = (await $`git -C ${root} rev-parse --abbrev-ref HEAD`.quiet().nothrow().text()).trim()
  return ref && ref !== "HEAD" ? { url: pathToFileURL(root).href, ref } : undefined
}

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
  const fallback = (await devSource()) ?? DEFAULT_SOURCE
  const enabled = marketplace?.enabled !== false
  return {
    enabled,
    autoFetch: enabled && marketplace?.autoFetch !== false,
    source: { url: marketplace?.url ?? fallback.url, ref: marketplace?.ref ?? fallback.ref }
  }
}
