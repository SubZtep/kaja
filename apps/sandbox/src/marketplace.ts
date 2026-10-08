import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fetchSources, parseMarketplaceSources } from "@kaja/nasi"

/**
 * The marketplace folder whose stdio manifests the sandbox runs: `MARKETPLACE_DIR` as it is when set (development,
 * tests), else `MARKETPLACE_SOURCES` fetched at startup into the state folder. A failed fetch keeps the last good copy
 * (or starts with none), so an offline restart still serves what it served before.
 */
export async function prepareMarketplace(env: {
  MARKETPLACE_DIR?: string
  MARKETPLACE_SOURCES: string
  MARKETPLACE_GITHUB_TOKEN?: string
  SANDBOX_STATE_DIR: string
}): Promise<string> {
  if (env.MARKETPLACE_DIR) return env.MARKETPLACE_DIR
  const dir = join(resolve(env.SANDBOX_STATE_DIR), "marketplace")
  try {
    const { sources } = await fetchSources(parseMarketplaceSources(env.MARKETPLACE_SOURCES), dir, {
      workDir: `${dir}-download`,
      token: env.MARKETPLACE_GITHUB_TOKEN
    })
    console.log(
      `Marketplace: ${sources.map(({ label, commit }) => (commit ? `${label} (${commit.slice(0, 7)})` : label)).join(", ")}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      `Marketplace fetch failed (${message}); ${existsSync(dir) ? "using the last copy" : "starting with no servers"}`
    )
    await mkdir(dir, { recursive: true })
  }
  return dir
}
