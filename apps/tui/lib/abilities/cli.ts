import { t } from "../i18n"
import { getMarketplaceDir, loadAbilitiesFile, resolveSource } from "./abilities-file"
import { fetchMarketplace } from "./fetch"
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

/** `kaja abilities update`: fetches the marketplace source and syncs it into the local marketplace folder. Returns what to print and the exit code, like `runConfigCli`. */
export async function runAbilityUpdate(): Promise<{ code: number; text: string }> {
  const source = resolveSource((await loadAbilitiesFile()).source)
  try {
    const { dir, commit } = await fetchMarketplace(source)
    const report = await syncMarketplace(dir, getMarketplaceDir(), { ...source, commit })
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
