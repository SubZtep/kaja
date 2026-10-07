import { type AbilityKeyNeed, personaAbilities } from "@kaja/nasi"
import { consolePalette, paint } from "../../components/theme"
import { secrets } from "../config/secrets"
import { getLanguage, t } from "../i18n"
import { loadPersonas } from "../personas/personas"
import { getMarketplaceDir, ownAbilities } from "./abilities-file"

/** One ability folder as `kaja abilities` shows it. */
type Row = { name: string; parts: string[]; errors: string[]; auth?: AbilityKeyNeed; runs?: string; needs?: string[] }

/**
 * `kaja abilities`' output: one line per ability in the marketplace folder (its parts, its key, which personas use
 * it; your own marked local), a line per part that can't load, and how to change things. Read-only.
 */
export async function abilityListLines(root = getMarketplaceDir()): Promise<string[]> {
  const { scanCodeTools, scanHttpTools, scanMcpAbilities, scanSkills } = await import("@kaja/nasi")
  const rows = new Map<string, Row>()
  const row = (name: string) => rows.get(name) ?? rows.set(name, { name, parts: [], errors: [] }).get(name)!
  const add = (entry: { name: string; error?: string }, part: string) => {
    if (entry.error) row(entry.name).errors.push(t("ability.brokenPart", { part, error: entry.error }))
    else row(entry.name).parts.push(part)
  }
  for (const entry of await scanSkills(root)) add(entry, t("ability.typeSkill"))
  for (const entry of await scanHttpTools(root)) {
    add(entry, t("ability.typeTool"))
    if (entry.auth) row(entry.name).auth = entry.auth
  }
  for (const entry of await scanMcpAbilities(root)) {
    add(entry, t("ability.typeMcp"))
    if (entry.auth) row(entry.name).auth = entry.auth
    if (entry.command) row(entry.name).runs = entry.command
    if (entry.needs) row(entry.name).needs = entry.needs
  }
  for (const name of await scanCodeTools(root)) add({ name }, t("ability.typeCode"))
  if (rows.size === 0) return [t("ability.empty")]

  const own = new Set((await ownAbilities(root)).abilities)
  const keys = (await secrets()).abilities
  const usedBy = new Map<string, string[]>()
  for (const persona of await loadPersonas()) {
    for (const name of personaAbilities(persona).keys()) usedBy.set(name, [...(usedBy.get(name) ?? []), persona.id])
  }

  const sorted = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
  const width = Math.max(...sorted.map(r => r.name.length))
  // The `local` tag gets a column of its own when any row has it, so the details still line up.
  const tag = sorted.some(r => own.has(r.name)) ? t("ability.local") : ""
  const palette = consolePalette()
  const lines = [paint(palette.accent)(t("ability.title"))]
  for (const r of sorted) {
    const name = tag
      ? `${r.name.padEnd(width)}  ${(own.has(r.name) ? tag : "").padEnd(tag.length)}`
      : r.name.padEnd(width)
    const details = [
      r.parts.join(" + "),
      keyStatus(r.auth, Boolean(keys[r.name]?.api_key)),
      r.runs && t("ability.runs", { command: r.runs }),
      r.needs && t("ability.needs", { programs: anyOf(r.needs) }),
      (usedBy.get(r.name) ?? []).join(", ") || t("ability.noPersona")
    ].filter(Boolean)
    lines.push(`  ${name}  ${details.join(" · ")}`)
    for (const error of r.errors) lines.push(paint(palette.danger)(`    ✗ ${error}`))
  }
  lines.push("", t("ability.listHint"))
  return lines
}

// Whether the ability takes a key and has one (without it, it's off unless keyless); nothing when it takes none.
function keyStatus(auth: AbilityKeyNeed | undefined, saved: boolean): string | undefined {
  if (!auth) return undefined
  if (saved) return t("ability.keySaved")
  return auth.keyless ? t("ability.keyless") : t("ability.noKey")
}

/** "uvx, pipx or docker", in the TUI's language. */
export function anyOf(programs: string[]): string {
  return new Intl.ListFormat(getLanguage(), { type: "disjunction" }).format(programs)
}
