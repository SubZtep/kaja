import { type AbilityKeyNeed, personaAbilities } from "@kaja/nasi"
import { consolePalette, paint } from "../../components/theme"
import { secrets } from "../config/secrets"
import { getLanguage, t } from "../i18n"
import { renderTable } from "../markdown/table"
import { loadPersonas } from "../personas/personas"
import { getMarketplaceDir, ownAbilities } from "./abilities-file"
import { toolHosts } from "./sandbox-relay"

/** One ability folder as `kaja abilities` shows it. */
type Row = {
  name: string
  parts: string[]
  errors: string[]
  auth?: AbilityKeyNeed
  /** A remote MCP server's host. */
  host?: string
  /** What starts a stdio MCP server here: its runner (bunx, uvx, docker) or the manifest's command. */
  runs?: string
  needs?: string
}

/**
 * `kaja abilities`' output: a table with one row per ability in the marketplace folder (its parts, what runs it, its
 * key, which personas use it; your own marked local), a line per part that can't load under it, and how to change
 * things. Fits `width` columns. Read-only.
 */
export async function abilityListLines(
  root = getMarketplaceDir(),
  width = process.stdout.columns || 100
): Promise<string[]> {
  const rows = await scanRows(root)
  if (rows.length === 0) return [t("ability.empty")]

  const own = new Set((await ownAbilities(root)).abilities)
  const keys = (await secrets()).abilities
  const usedBy = await personasByAbility()
  const hosts = await toolHosts()
  const palette = consolePalette()
  const muted = paint(palette.muted)

  const sorted = rows.toSorted((a, b) => a.name.localeCompare(b.name))
  const table = renderTable({
    head: [
      t("ability.colName"),
      t("ability.colParts"),
      t("ability.colRuns"),
      t("ability.colKey"),
      t("ability.colPersonas")
    ],
    rows: sorted.map(r => [
      own.has(r.name) ? `${r.name} ${paint(palette.accent)(t("ability.local"))}` : r.name,
      r.parts.join(" + "),
      runsCell(r, hosts[r.name] === "sandbox"),
      keyCell(r.auth, Boolean(keys[r.name]?.api_key)),
      (usedBy.get(r.name) ?? []).join(", ") || muted(t("ability.noPersona"))
    ]),
    align: [null, null, null, null, null],
    maxWidth: width,
    headStyle: text => paint(palette.accent).bold(text),
    borderStyle: muted
  })
  const errors = sorted.flatMap(r => r.errors.map(error => paint(palette.danger)(`✗ ${r.name}: ${error}`)))
  return [table, ...(errors.length ? ["", ...errors] : []), "", muted(t("ability.listHint"))]
}

// Where an MCP server runs: a remote one's host; a stdio one's runner here, a sandbox when settings.toml sends it there, or what to install.
function runsCell(r: Row, onSandbox: boolean): string {
  const palette = consolePalette()
  if (r.host) return r.host
  if (!r.runs && !r.needs) return ""
  if (onSandbox) return paint(palette.user)(t("ability.onSandbox"))
  if (r.needs) return paint(palette.warning)(t("ability.needs", { programs: r.needs }))
  return r.runs ?? ""
}

// Whether the ability takes a key and has one (without it, it's off unless keyless); empty when it takes none.
function keyCell(auth: AbilityKeyNeed | undefined, saved: boolean): string {
  const palette = consolePalette()
  if (!auth) return ""
  if (saved) return paint(palette.success)(t("ability.keySaved"))
  return auth.keyless ? paint(palette.muted)(t("ability.keyless")) : paint(palette.warning)(t("ability.noKey"))
}

// One row per ability folder, with its parts (or why a part can't load), its key, and what runs its MCP server.
async function scanRows(root: string): Promise<Row[]> {
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
    // The runner alone (bunx, uvx, docker, or the manifest's command): the whole command line would wrap the table.
    if (entry.command) row(entry.name).runs = entry.command.split(" ")[0]
    if (entry.domain) row(entry.name).host = entry.domain
    if (entry.needs || entry.requires) row(entry.name).needs = missingPrograms(entry.needs, entry.requires)
  }
  for (const name of await scanCodeTools(root)) add({ name }, t("ability.typeCode"))
  return [...rows.values()]
}

// Which personas use each ability, by ability name.
async function personasByAbility(): Promise<Map<string, string[]>> {
  const usedBy = new Map<string, string[]>()
  for (const persona of await loadPersonas()) {
    for (const name of personaAbilities(persona).keys()) usedBy.set(name, [...(usedBy.get(name) ?? []), persona.id])
  }
  return usedBy
}

/**
 * What to install so a stdio ability can start: one of its runners, and every program it drives, e.g. "uvx, pipx or
 * docker and Chrome".
 */
export function missingPrograms(needs: string[] = [], requires: string[] = []): string {
  const parts = [...(needs.length ? [anyOf(needs)] : []), ...requires]
  return new Intl.ListFormat(getLanguage(), { type: "conjunction" }).format(parts)
}

/** "uvx, pipx or docker", in the TUI's language. */
function anyOf(programs: string[]): string {
  return new Intl.ListFormat(getLanguage(), { type: "disjunction" }).format(programs)
}
