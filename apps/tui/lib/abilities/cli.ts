import { t } from "../i18n"
import { getMarketplaceDir, marketplaceSettings } from "./abilities-file"
import { FETCH_STEPS, fetchMarketplace } from "./fetch"
import { type SyncReport, syncMarketplace } from "./sync"

function reportLines(report: SyncReport): string[] {
  return [
    ...report.added.map(path => t("ability.added", { path })),
    ...report.updated.map(path => t("ability.updatedFile", { path })),
    ...report.backedUp.map(({ path, backup }) => t("ability.backedUp", { path, backup })),
    ...report.removed.map(path => t("ability.removed", { path })),
    ...report.kept.map(path => t("ability.kept", { path }))
  ]
}

/** How many times {@link runAbilityUpdate} calls its `onStep`: the fetch's steps, then the sync. */
export const UPDATE_STEPS = FETCH_STEPS + 1

/**
 * `kaja abilities update`: fetches the marketplace source and syncs it into the local marketplace folder. Returns what
 * to print and the exit code, like `runConfigCli`. Calls `onStep` after each of its {@link UPDATE_STEPS} steps.
 */
export async function runAbilityUpdate(onStep: () => void = () => {}): Promise<{ code: number; text: string }> {
  const { enabled, source } = await marketplaceSettings()
  if (!enabled) return { code: 1, text: t("ability.disabled") }
  try {
    const { dir, commit } = await fetchMarketplace(source, onStep)
    const report = await syncMarketplace(dir, getMarketplaceDir(), { ...source, commit })
    onStep()
    const lines = reportLines(report)
    const summary = t("ability.synced", { url: source.url, ref: source.ref, commit: commit.slice(0, 7) })
    return { code: 0, text: [summary, ...(lines.length > 0 ? lines : [t("ability.nothingChanged")])].join("\n") }
  } catch (error) {
    return {
      code: 1,
      text: t("ability.fetchFailed", { message: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Syncs the marketplace the first time, so there is something to load. A failure is reported and leaves whatever is already on disk. */
export async function ensureMarketplace(print: (line: string) => void): Promise<void> {
  const { readSyncLock } = await import("./sync")
  if (!(await marketplaceSettings()).enabled || (await readSyncLock(getMarketplaceDir()))) return

  const { withStepProgress } = await import("./progress")
  print((await withStepProgress(t("ability.firstSync"), UPDATE_STEPS, runAbilityUpdate)).text)
}
