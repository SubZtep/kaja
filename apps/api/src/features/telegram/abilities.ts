import { createHash } from "node:crypto"
import type { AbilityType } from "@kaja/schema/api"
import { trimTrailingSlashes } from "@kaja/shared"
import { env } from "../../core/env"
import type { Translate } from "../../core/i18n"
import { abilityService } from "../../services"
import type { TelegramButton } from "./driver"

/** Buttons per page, so the list stays one screen tall. */
const PAGE_SIZE = 8
const TYPE_ORDER: AbilityType[] = ["skill", "persona", "tool", "mcp"]
const TYPE_CODE: Record<AbilityType, string> = { skill: "s", persona: "p", tool: "t", mcp: "m" }
const STATE_ICON = { on: "✅", off: "▫️", key: "🔑", gone: "⚠️" } as const

/** `ability:<type>:<name hash>:<page>` toggles one ability; `abilitypage:<page>` turns the page. Both stay under the Bot API's 64-byte cap. */
export const ABILITY_CALLBACK = /^ability:([sptm]):([0-9a-f]{12}):(\d+)$/
export const ABILITY_PAGE_CALLBACK = /^abilitypage:(\d+)$/

/** One row of the list: on, off, off because it needs a key the user hasn't saved, or on but gone from the marketplace. */
export type AbilityEntry = { type: AbilityType; name: string; state: keyof typeof STATE_ICON }

function nameHash(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 12)
}

/** Where keys are added and abilities read in full. */
function abilitiesWebUrl(): string {
  return `${trimTrailingSlashes(env.WEB_PUBLIC_URL ?? env.CORS_ORIGIN)}/abilities`
}

/** The catalog as the user sees it (skills, personas, tools, then MCP servers), plus enabled abilities that left it. */
export async function abilityEntries(userId: string): Promise<AbilityEntry[]> {
  const [catalog, mine, keys] = await Promise.all([
    abilityService.listCatalog(),
    abilityService.listForUser(userId),
    abilityService.keyNames(userId)
  ])
  const enabled = new Set(mine.map(ability => `${ability.type}:${ability.name}`))
  const saved = new Set(keys)
  const listed: AbilityEntry[] = catalog.map(ability => {
    const needsKey = (ability.http?.key ?? ability.mcp?.key) === "required" && !saved.has(ability.name)
    const offState = needsKey ? "key" : "off"
    return {
      type: ability.type,
      name: ability.name,
      state: enabled.has(`${ability.type}:${ability.name}`) ? "on" : offState
    }
  })
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
export function renderAbilityList(
  entries: AbilityEntry[],
  page: number,
  t: Translate
): { text: string; rows: TelegramButton[][] } {
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const current = Math.min(Math.max(page, 0), pages - 1)
  const lines = [
    t("telegram.abilities.title"),
    entries.length === 0 ? t("telegram.abilities.empty") : t("telegram.abilities.hint"),
    t("telegram.abilities.legend"),
    `<a href="${abilitiesWebUrl()}">${t("telegram.abilities.webLink")}</a>`,
    ...(pages > 1 ? [t("telegram.abilities.page", { current: current + 1, total: pages })] : [])
  ]
  const rows: TelegramButton[][] = entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map(entry => {
    const typeLabel = t(`telegram.abilities.${entry.type}`)
    return [
      {
        text: `${STATE_ICON[entry.state]} ${entry.name} · ${typeLabel}`,
        data: `ability:${TYPE_CODE[entry.type]}:${nameHash(entry.name)}:${current}`
      }
    ]
  })
  if (pages > 1) {
    rows.push([
      ...(current > 0 ? [{ text: t("telegram.abilities.previous"), data: `abilitypage:${current - 1}` }] : []),
      ...(current < pages - 1 ? [{ text: t("telegram.abilities.next"), data: `abilitypage:${current + 1}` }] : [])
    ])
  }
  return { text: lines.join("\n"), rows }
}

/** What a tap on an ability does: turn it on or off, or (it needs a key first) point to the web, where keys are added. */
export async function toggleAbility(userId: string, entry: AbilityEntry): Promise<"changed" | "needs_key"> {
  if (entry.state === "key") return "needs_key"
  if (entry.state === "on" || entry.state === "gone") {
    await abilityService.disable(userId, entry.type, entry.name)
    return "changed"
  }
  return (await abilityService.enable(userId, entry.type, entry.name)) === "key_required" ? "needs_key" : "changed"
}

/** The reply to a tap on an ability that needs a key: keys are never typed into Telegram. */
export function needsKeyMessage(name: string, t: Translate): string {
  return `${t("telegram.abilities.needsKey", { name })}\n<a href="${abilitiesWebUrl()}">${t("telegram.abilities.needsKeyLink")}</a>`
}
