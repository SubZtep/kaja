import { createHash } from "node:crypto"
import type { AbilityType } from "@kaja/schema/api"
import { trimTrailingSlashes } from "@kaja/shared"
import { env } from "../../core/env"
import { abilityService } from "../../services"
import type { TelegramButton } from "./driver"

/** Buttons per page, so the list stays one screen tall. */
const PAGE_SIZE = 8
const TYPE_ORDER: AbilityType[] = ["skill", "persona", "tool", "mcp"]
const TYPE_LABEL: Record<AbilityType, string> = { skill: "skill", persona: "persona", tool: "tool", mcp: "MCP" }
const TYPE_CODE: Record<AbilityType, string> = { skill: "s", persona: "p", tool: "t", mcp: "m" }
const STATE_ICON = { on: "✅", off: "▫️", gone: "⚠️" } as const

/** `ability:<type>:<name hash>:<page>` toggles one ability; `abilitypage:<page>` turns the page. Both stay under the Bot API's 64-byte cap. */
export const ABILITY_CALLBACK = /^ability:([sptm]):([0-9a-f]{12}):(\d+)$/
export const ABILITY_PAGE_CALLBACK = /^abilitypage:(\d+)$/

/** One row of the list: on, off, or on but gone from the marketplace. */
export type AbilityEntry = { type: AbilityType; name: string; state: keyof typeof STATE_ICON }

function nameHash(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 12)
}

/** Where abilities are read in full. */
function abilitiesWebUrl(): string {
  return `${trimTrailingSlashes(env.WEB_PUBLIC_URL ?? env.CORS_ORIGIN)}/abilities`
}

/** The catalog as the user sees it (skills, personas, tools, then MCP servers), plus enabled abilities that left it. */
export async function abilityEntries(userId: string): Promise<AbilityEntry[]> {
  const [catalog, mine] = await Promise.all([abilityService.listCatalog(), abilityService.listForUser(userId)])
  const enabled = new Set(mine.map(ability => `${ability.type}:${ability.name}`))
  const listed: AbilityEntry[] = catalog.map(ability => ({
    type: ability.type,
    name: ability.name,
    state: enabled.has(`${ability.type}:${ability.name}`) ? "on" : "off"
  }))
  const gone: AbilityEntry[] = mine
    .filter(ability => !ability.available)
    .map(ability => ({ type: ability.type, name: ability.name, state: "gone" }))
  return [...listed, ...gone].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name)
  )
}

/** The entry a toggle button points at, if it's still there. */
export function findEntry(entries: AbilityEntry[], typeCode: string, hash: string): AbilityEntry | undefined {
  return entries.find(entry => TYPE_CODE[entry.type] === typeCode && nameHash(entry.name) === hash)
}

/** The /abilities message for one page: a legend, a web link, and one button per ability plus page arrows. */
export function renderAbilityList(entries: AbilityEntry[], page: number): { text: string; rows: TelegramButton[][] } {
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const current = Math.min(Math.max(page, 0), pages - 1)
  const lines = [
    "<b>Abilities</b>",
    entries.length === 0
      ? "Nothing in the catalog yet."
      : "Tap one to turn it on or off; it applies from your next message.",
    "✅ on · ▫️ off · ⚠️ no longer available",
    `<a href="${abilitiesWebUrl()}">Read them in full on the web</a>`,
    ...(pages > 1 ? [`Page ${current + 1} of ${pages}`] : [])
  ]
  const rows: TelegramButton[][] = entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(entry => [
    {
      text: `${STATE_ICON[entry.state]} ${entry.name} · ${TYPE_LABEL[entry.type]}`,
      data: `ability:${TYPE_CODE[entry.type]}:${nameHash(entry.name)}:${current}`
    }
  ])
  if (pages > 1) {
    rows.push([
      ...(current > 0 ? [{ text: "‹ Previous", data: `abilitypage:${current - 1}` }] : []),
      ...(current < pages - 1 ? [{ text: "Next ›", data: `abilitypage:${current + 1}` }] : [])
    ])
  }
  return { text: lines.join("\n"), rows }
}

/** What a tap on an ability does: turn it on or off. */
export async function toggleAbility(userId: string, entry: AbilityEntry): Promise<void> {
  if (entry.state === "on" || entry.state === "gone") await abilityService.disable(userId, entry.type, entry.name)
  else await abilityService.enable(userId, entry.type, entry.name)
}
