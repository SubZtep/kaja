import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { type Persona, PersonaSchema, type SamplingParams } from "@kaja/schema/cli"
import type { CliResolvedModel } from "@kaja/schema/config"
import { file, TOML, write } from "bun"
// Written on first run: one file per persona, the stock assistant plus the
// app's former built-in personas, sourced from the same files that document
// repo docs/config/personas/ (also published on the docs site).
import BARKOCHBA_TEMPLATE from "../../../../docs/config/personas/barkochba.toml" with { type: "text" }
import CARE_TEMPLATE from "../../../../docs/config/personas/care.toml" with { type: "text" }
import DEFAULT_TEMPLATE from "../../../../docs/config/personas/default.toml" with { type: "text" }
import ONBOARDING_TEMPLATE from "../../../../docs/config/personas/onboarding.toml" with { type: "text" }
import { getConfigDir } from "../config/config"
import { log } from "../logger"

export type { Persona }

const TEMPLATES: Record<string, string> = {
  default: DEFAULT_TEMPLATE,
  barkochba: BARKOCHBA_TEMPLATE,
  care: CARE_TEMPLATE,
  onboarding: ONBOARDING_TEMPLATE
}

/** Pulls a persona's optional sampling overrides into an Agent-shaped object. */
export function samplingOf(persona?: Persona): SamplingParams | undefined {
  if (!persona) return undefined
  const { temperature, top_p, max_tokens, frequency_penalty, presence_penalty, seed } = persona
  const sampling = {
    temperature,
    top_p,
    max_tokens,
    frequency_penalty,
    presence_penalty,
    seed
  }
  return Object.values(sampling).some(v => v !== undefined) ? sampling : undefined
}

export function getPersonasDir() {
  return join(getConfigDir(), "personas")
}

/** Loads personas/*.toml (id = filename). Writes default templates if the directory is missing; invalid files are skipped with a warning. */
export async function loadPersonas(models: CliResolvedModel[]): Promise<Persona[]> {
  const dir = getPersonasDir()
  if (!existsSync(dir)) {
    for (const [id, text] of Object.entries(TEMPLATES)) {
      await write(join(dir, `${id}.toml`), text)
    }
  }
  const glob = new Bun.Glob("*.toml")
  const entries: string[] = []
  for await (const match of glob.scan({ cwd: dir, dot: false })) {
    entries.push(match)
  }
  const modelIds = new Set(models.map(m => m.model))
  const personas: Persona[] = []

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
  entries.sort(collator.compare)
  for (const entry of entries) {
    const path = join(dir, entry)
    const id = basename(entry, ".toml")
    try {
      const data = PersonaSchema.parse(TOML.parse(await file(path).text()))
      if (data.model && !modelIds.has(data.model)) throw new Error(`names unknown model "${data.model}"`)
      personas.push({ ...data, id })
    } catch (error) {
      log.warn({ error, path }, "Failed to load persona")
    }
  }
  return personas
}
