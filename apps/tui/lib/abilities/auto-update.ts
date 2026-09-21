import { stat } from "node:fs/promises"
import { join } from "node:path"
import { getMarketplaceDir, marketplaceSettings } from "./abilities-file"
import { runAbilityUpdate } from "./cli"
import { LOCK_FILE } from "./sync"

/** How long a sync stays fresh before startup pulls the marketplace again. */
export const AUTO_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Pulls the marketplace in the background when the last sync is older than a day and settings.toml's
 * `[marketplace]` allows it (`enabled` and `autoFetch`, both on by default). Only a machine that has synced once
 * (the lock file exists) is touched, and a failure is dropped: offline or without git, the folder on disk keeps working.
 * Changes take effect on the next launch, since abilities load at startup.
 */
export async function autoUpdateAbilities(
  opts: { now?: number; update?: () => Promise<{ code: number }>; dir?: string } = {}
): Promise<boolean> {
  const { now = Date.now(), update = runAbilityUpdate, dir = getMarketplaceDir() } = opts
  try {
    if (!(await marketplaceSettings()).autoFetch) return false
    const { mtimeMs } = await stat(join(dir, LOCK_FILE))
    if (now - mtimeMs < AUTO_UPDATE_INTERVAL_MS) return false
    return (await update()).code === 0
  } catch {
    return false
  }
}
