import { createHash } from "node:crypto"
import type { PackageType } from "@kaja/schema/api"
import { env } from "../../core/env"
import { packageService } from "../../services"
import type { TelegramButton } from "./driver"

/** Buttons per page, so the list stays one screen tall. */
const PAGE_SIZE = 8
const TYPE_ORDER: PackageType[] = ["skill", "tool", "mcp"]
const TYPE_LABEL: Record<PackageType, string> = { skill: "skill", tool: "tool", mcp: "MCP" }
const TYPE_CODE: Record<PackageType, string> = { skill: "s", tool: "t", mcp: "m" }
const STATE_ICON = { on: "✅", off: "▫️", key: "🔑", gone: "⚠️" } as const

/** `pkg:<type>:<name hash>:<page>` toggles one package; `pkgp:<page>` turns the page. Both stay under the Bot API's 64-byte cap. */
export const PACKAGE_CALLBACK = /^pkg:([stm]):([0-9a-f]{12}):(\d+)$/
export const PACKAGE_PAGE_CALLBACK = /^pkgp:(\d+)$/

/** One row of the list: on, off, off because it needs a key the user hasn't saved, or on but gone from the marketplace. */
export type PackageEntry = { type: PackageType; name: string; state: keyof typeof STATE_ICON }

function nameHash(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 12)
}

/** Where keys are added and packages read in full. */
export function packagesWebUrl(tab?: "tools"): string {
  const base = (env.WEB_PUBLIC_URL ?? env.CORS_ORIGIN).replace(/\/+$/, "")
  return `${base}/packages${tab ? `?tab=${tab}` : ""}`
}

/** The catalog as the user sees it (skills, then tools, then MCP servers), plus enabled packages that left it. */
export async function packageEntries(userId: string): Promise<PackageEntry[]> {
  const [catalog, mine, keys] = await Promise.all([
    packageService.listCatalog(),
    packageService.listForUser(userId),
    packageService.keyNames(userId)
  ])
  const enabled = new Set(mine.map(pkg => `${pkg.type}:${pkg.name}`))
  const saved = new Set(keys)
  const listed: PackageEntry[] = catalog.map(pkg => {
    const needsKey = (pkg.http?.key ?? pkg.mcp?.key) === "required" && !saved.has(pkg.name)
    const state = enabled.has(`${pkg.type}:${pkg.name}`) ? "on" : needsKey ? "key" : "off"
    return { type: pkg.type, name: pkg.name, state }
  })
  const gone: PackageEntry[] = mine
    .filter(pkg => !pkg.available)
    .map(pkg => ({ type: pkg.type, name: pkg.name, state: "gone" }))
  return [...listed, ...gone].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name)
  )
}

/** The entry a toggle button points at, if it's still there. */
export function findEntry(entries: PackageEntry[], typeCode: string, hash: string): PackageEntry | undefined {
  return entries.find(entry => TYPE_CODE[entry.type] === typeCode && nameHash(entry.name) === hash)
}

/** The /packages message for one page: a legend, a web link, and one button per package plus page arrows. */
export function renderPackageList(entries: PackageEntry[], page: number): { text: string; rows: TelegramButton[][] } {
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const current = Math.min(Math.max(page, 0), pages - 1)
  const lines = [
    "<b>Packages</b>",
    entries.length === 0
      ? "Nothing in the catalog yet."
      : "Tap one to turn it on or off; it applies from your next message.",
    "✅ on · ▫️ off · 🔑 needs your API key first · ⚠️ no longer available",
    `<a href="${packagesWebUrl()}">Read them in full and manage keys on the web</a>`,
    ...(pages > 1 ? [`Page ${current + 1} of ${pages}`] : [])
  ]
  const rows: TelegramButton[][] = entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(entry => [
    {
      text: `${STATE_ICON[entry.state]} ${entry.name} · ${TYPE_LABEL[entry.type]}`,
      data: `pkg:${TYPE_CODE[entry.type]}:${nameHash(entry.name)}:${current}`
    }
  ])
  if (pages > 1) {
    rows.push([
      ...(current > 0 ? [{ text: "‹ Previous", data: `pkgp:${current - 1}` }] : []),
      ...(current < pages - 1 ? [{ text: "Next ›", data: `pkgp:${current + 1}` }] : [])
    ])
  }
  return { text: lines.join("\n"), rows }
}

/** What a tap on a package does: turn it on or off, or (it needs a key first) point to the web, where keys are added. */
export async function togglePackage(userId: string, entry: PackageEntry): Promise<"changed" | "needs_key"> {
  if (entry.state === "key") return "needs_key"
  if (entry.state === "on" || entry.state === "gone") {
    await packageService.disable(userId, entry.type, entry.name)
    return "changed"
  }
  return (await packageService.enable(userId, entry.type, entry.name)) === "key_required" ? "needs_key" : "changed"
}

/** The reply to a tap on a package that needs a key: keys are never typed into Telegram. */
export function needsKeyMessage(name: string): string {
  return (
    `🔑 <b>${name}</b> needs your API key first. Add it on the web, where it's stored encrypted; ` +
    `a key typed here would stay in the chat history.\n<a href="${packagesWebUrl("tools")}">Packages → Tools</a>`
  )
}
