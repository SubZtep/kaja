import { t } from "../i18n"
import { fetchMarketplace } from "./fetch"
import { getMarketplaceDir, loadPackagesFile, resolveSource } from "./packages-file"
import { type SyncReport, syncMarketplace } from "./sync"

function reportLines(report: SyncReport): string[] {
  return [
    ...report.added.map(path => t("pkg.added", { path })),
    ...report.updated.map(path => t("pkg.updatedFile", { path })),
    ...report.backedUp.map(({ path, backup }) => t("pkg.backedUp", { path, backup })),
    ...report.removed.map(path => t("pkg.removed", { path })),
    ...report.kept.map(path => t("pkg.kept", { path }))
  ]
}

/** `kaja pkg update`: fetches the marketplace source and syncs it into the local marketplace folder. Returns what to print and the exit code, like `runConfigCli`. */
export async function runPkgUpdate(): Promise<{ code: number; text: string }> {
  const source = resolveSource((await loadPackagesFile()).source)
  try {
    const { dir, commit } = await fetchMarketplace(source)
    const report = await syncMarketplace(dir, getMarketplaceDir(), { ...source, commit })
    const lines = reportLines(report)
    const summary = t("pkg.synced", { url: source.url, ref: source.ref, commit: commit.slice(0, 7) })
    return { code: 0, text: [summary, ...(lines.length > 0 ? lines : [t("pkg.nothingChanged")])].join("\n") }
  } catch (error) {
    return { code: 1, text: t("pkg.fetchFailed", { message: error instanceof Error ? error.message : String(error) }) }
  }
}
