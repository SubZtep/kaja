import { join } from "node:path"
import { FETCH_SOURCES_STEPS, fetchSources, parseMarketplaceSource } from "@kaja/nasi"
import { getPaths } from "../paths"

/** Where the fetched sources are merged before the sync copies them into the marketplace folder. */
export function getMarketplaceCacheDir() {
  return join(getPaths().cache, "marketplace")
}

/** How many times {@link fetchMarketplace} calls its `onStep`. */
export const FETCH_STEPS = FETCH_SOURCES_STEPS

/**
 * Downloads every source (GitHub tarballs, or local folders as they are) and merges them, later sources winning, into
 * the cache; returns the merged folder and each source's commit. Only this touches the network: `kaja abilities` and
 * the throttled background pull at local startup (`auto-update.ts`). Calls `onStep` after each of its {@link FETCH_STEPS} steps.
 */
export async function fetchMarketplace(
  entries: string[],
  opts: { token?: string; onStep?: () => void } = {}
): Promise<{ dir: string; sources: { source: string; commit?: string }[] }> {
  const dir = getMarketplaceCacheDir()
  const { sources } = await fetchSources(entries.map(parseMarketplaceSource), dir, {
    workDir: `${dir}-download`,
    token: opts.token,
    onStep: opts.onStep
  })
  return { dir, sources: sources.map(({ label, commit }) => ({ source: label, ...(commit ? { commit } : {}) })) }
}
