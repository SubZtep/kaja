import { t } from "../i18n"

const UNITS = ["B", "KB", "MB", "GB", "TB"]

/** 512 KB, 1.4 GB: binary units, one decimal from a megabyte up. */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${UNITS[unit]}`
}

/** What `kaja images` prints of a store's images; `added` (cloud only) is what arrived in the last `days` days. */
export type ImageReport = {
  count: number
  bytes: number
  described: number
  undescribed: number
  added?: { days: number; count: number; bytes: number }
  sites: { host: string; images: number }[]
  sessions: { id: string; title: string; images: number; bytes: number }[]
}

/** The `kaja images` text: totals, then the sites most images came from and the sessions holding the most. */
export function formatImageReport(report: ImageReport): string {
  if (report.count === 0) return t("images.empty")
  const lines = [
    t("images.totals", { count: report.count, size: formatBytes(report.bytes) }),
    t("images.descriptions", { described: report.described, undescribed: report.undescribed })
  ]
  if (report.added)
    lines.push(
      t("images.added", { days: report.added.days, count: report.added.count, size: formatBytes(report.added.bytes) })
    )
  if (report.sites.length > 0) {
    lines.push("", t("images.sitesTitle"))
    const width = Math.max(...report.sites.map(site => site.host.length))
    for (const site of report.sites) lines.push(`  ${site.host.padEnd(width)}  ${site.images}`)
  }
  if (report.sessions.length > 0) {
    lines.push("", t("images.sessionsTitle"))
    for (const session of report.sessions)
      lines.push(
        `  ${session.id}  ${t("images.sessionLine", { images: session.images, size: formatBytes(session.bytes), title: session.title })}`
      )
  }
  if (report.undescribed > 0) lines.push("", t("images.describeHint"))
  return lines.join("\n")
}
