import { existsSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_MARKETPLACE_SOURCE } from "@kaja/nasi"
import { getConfigDir, readConfigLoose } from "../config/config"
import { readSecretsLoose } from "../config/secrets"
import { syncedAbilityPaths } from "./sync"

// The checkout this CLI runs from (apps/tui/lib/abilities → the repo root); a compiled binary has none.
const REPO_ROOT = join(import.meta.dir, "../../../..")

/**
 * The default source under `KAJA_PROFILE=dev`: a marketplace checkout beside the Kaja source (`../marketplace`), read
 * as a folder so uncommitted edits sync too. Undefined for any other profile, or when there is no such checkout.
 */
export function devSource(root = REPO_ROOT): string | undefined {
  const dir = join(root, "..", "marketplace")
  return Bun.env.KAJA_PROFILE === "dev" && existsSync(join(dir, "abilities")) ? dir : undefined
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

/**
 * settings.toml's `[marketplace]`: both switches on unless turned off, the sources to fetch (entries as written, parsed
 * by the fetch), and secrets.toml's GitHub token for a private one. Tolerant of broken files, like the wizard prefill.
 */
export async function marketplaceSettings(): Promise<{
  enabled: boolean
  autoFetch: boolean
  sources: string[]
  token?: string
}> {
  const { marketplace } = await readConfigLoose()
  const enabled = marketplace?.enabled !== false
  const configured = marketplace?.sources?.filter(entry => typeof entry === "string" && entry.trim())
  const token: unknown = (await readSecretsLoose()).marketplace?.github_token
  return {
    enabled,
    autoFetch: enabled && marketplace?.autoFetch !== false,
    sources: configured?.length ? configured : [devSource() ?? DEFAULT_MARKETPLACE_SOURCE],
    ...(typeof token === "string" && token ? { token } : {})
  }
}
