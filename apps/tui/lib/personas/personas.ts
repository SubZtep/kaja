import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPersonas, scanPersonas } from "@kaja/nasi"
import { type Persona as PersonaManifest, PersonaSchema } from "@kaja/schema/cli"
import { TOML } from "bun"
// Built in, so a fresh install has a persona before any `kaja abilities update`; the same file the marketplace syncs.
import DEFAULT_TEMPLATE from "../../../../config/default-persona.toml" with { type: "text" }
import { getMarketplaceDir, ownAbilities } from "../abilities/abilities-file"

/** A loaded persona; `local` marks your own file, one the marketplace sync didn't write. */
export type Persona = PersonaManifest & { local?: boolean }

/** The persona that always loads, first in the roster. */
export const DEFAULT_PERSONA_ID = "default"

function builtinDefault(): Persona {
  return { ...PersonaSchema.parse(TOML.parse(DEFAULT_TEMPLATE)), id: DEFAULT_PERSONA_ID }
}

/**
 * The personas to offer, `default` first: marketplace/personas/default.toml when there is one, else the built-in
 * one. Then every other persona in marketplace/personas/, by id, your own (see {@link ownAbilities}) marked `local`;
 * broken files are skipped with a warning. A persona's models table isn't validated against models.toml here — an
 * unmatched model id soft-falls-back at resolution time (see resolveActiveModel).
 */
export async function loadPersonas(): Promise<Persona[]> {
  const root = getMarketplaceDir()
  const own = new Set((await ownAbilities(root)).personas)
  const others = (await scanPersonas(root))
    .map(entry => entry.name)
    .filter(id => id !== DEFAULT_PERSONA_ID)
    .sort((a, b) => a.localeCompare(b))
  const ownDefault = existsSync(join(root, "personas", `${DEFAULT_PERSONA_ID}.toml`))
  const personas: Persona[] = (await readPersonas(root, ownDefault ? [DEFAULT_PERSONA_ID, ...others] : others)).map(
    persona => (own.has(persona.id) ? { ...persona, local: true } : persona)
  )
  if (personas[0]?.id !== DEFAULT_PERSONA_ID) personas.unshift(builtinDefault())
  return personas
}
