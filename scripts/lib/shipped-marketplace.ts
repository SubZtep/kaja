import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * The marketplace checkout the shipped-content tests read: `KAJA_MARKETPLACE_DIR`, else `../marketplace` beside this
 * repo. Undefined (so those tests skip) when it isn't there, except in CI, where a missing one fails instead.
 */
export function shippedMarketplace(): string | undefined {
  const dir = resolve(Bun.env.KAJA_MARKETPLACE_DIR || join(import.meta.dir, "../../../marketplace"))
  if (existsSync(join(dir, "abilities"))) return dir
  if (Bun.env.CI)
    throw new Error(`No marketplace checkout at ${dir}: clone kajaio/marketplace there or set KAJA_MARKETPLACE_DIR`)
  return undefined
}
