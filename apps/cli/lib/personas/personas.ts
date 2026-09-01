import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { samplingOf } from "@kaja/nasi"
import { type Persona, PersonaSchema } from "@kaja/schema/cli"
import { file, TOML, write } from "bun"
// Written on first run: one file per persona, the stock assistant plus the app's former built-in personas, sourced from the same files that document repo docs/config/personas/ (also published on the docs site).
import BARKOCHBA_TEMPLATE from "../../../../docs/config/personas/barkochba.toml" with { type: "text" }
import CARE_TEMPLATE from "../../../../docs/config/personas/care.toml" with { type: "text" }
import DEFAULT_TEMPLATE from "../../../../docs/config/personas/default.toml" with { type: "text" }
import ONBOARDING_TEMPLATE from "../../../../docs/config/personas/onboarding.toml" with { type: "text" }
import { getConfigDir } from "../config/config"
import { log } from "../logger"

export type { Persona }
export { samplingOf }

const TEMPLATES: Record<string, string> = {
  default: DEFAULT_TEMPLATE,
  barkochba: BARKOCHBA_TEMPLATE,
  care: CARE_TEMPLATE,
  onboarding: ONBOARDING_TEMPLATE
}

export function getPersonasDir() {
  return join(getConfigDir(), "personas")
}

const FETCHED_FILENAME = "_fetched.toml"

/** Loads personas/*.toml (id = filename). Writes default templates if the directory is missing; invalid files are skipped with a warning. A persona's models table isn't validated against models.toml here — an unmatched model id soft-falls-back at resolution time (see resolveActiveModel). Also merges in `kaja config fetch`'s combined _fetched.toml for any id not already covered by an individual file, so a hand-edited local persona always wins. */
export async function loadPersonas(): Promise<Persona[]> {
  const dir = getPersonasDir()
  if (!existsSync(dir)) {
    for (const [id, text] of Object.entries(TEMPLATES)) {
      await write(join(dir, `${id}.toml`), text)
    }
  }
  const glob = new Bun.Glob("*.toml")
  const entries: string[] = []
  for await (const match of glob.scan({ cwd: dir, dot: false })) {
    if (match !== FETCHED_FILENAME) entries.push(match)
  }
  const personas: Persona[] = []

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
  entries.sort(collator.compare)
  for (const entry of entries) {
    const path = join(dir, entry)
    const id = basename(entry, ".toml")
    try {
      const data = PersonaSchema.parse(TOML.parse(await file(path).text()))
      personas.push({ ...data, id })
    } catch (error) {
      log.warn({ error, path }, "Failed to load persona")
    }
  }

  const fetchedPath = join(dir, FETCHED_FILENAME)
  if (existsSync(fetchedPath)) {
    const knownIds = new Set(personas.map(p => p.id))
    try {
      const { personas: fetched } = TOML.parse(await file(fetchedPath).text()) as { personas?: Record<string, unknown> }
      for (const [id, raw] of Object.entries(fetched ?? {})) {
        if (knownIds.has(id)) continue
        try {
          personas.push({ ...PersonaSchema.parse(raw), id })
        } catch (error) {
          log.warn({ error, id }, "Failed to load fetched persona")
        }
      }
    } catch (error) {
      log.warn({ error, path: fetchedPath }, "Failed to load fetched personas")
    }
  }

  return personas
}
