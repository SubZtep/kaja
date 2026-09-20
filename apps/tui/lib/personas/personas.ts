import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPersonas } from "@kaja/nasi"
import { type Persona, PersonaSchema } from "@kaja/schema/cli"
import { TOML } from "bun"
// Built in, so a fresh install has a persona before any `kaja abilities update`; the same file the marketplace syncs.
import DEFAULT_TEMPLATE from "../../../../marketplace/personas/default.toml" with { type: "text" }
import { getMarketplaceDir, loadAbilitiesFile } from "../abilities/abilities-file"

export type { Persona }

/** The persona that always loads, whether or not abilities.toml lists it. */
export const DEFAULT_PERSONA_ID = "default"

function builtinDefault(): Persona {
  return { ...PersonaSchema.parse(TOML.parse(DEFAULT_TEMPLATE)), id: DEFAULT_PERSONA_ID }
}

/**
 * The personas to offer, `default` first: marketplace/personas/default.toml when there is one, else the built-in
 * one. Then the personas abilities.toml enables, by id; broken or missing files are skipped with a warning. A
 * persona's models table isn't validated against models.toml here — an unmatched model id soft-falls-back at
 * resolution time (see resolveActiveModel).
 */
export async function loadPersonas(): Promise<Persona[]> {
  const root = getMarketplaceDir()
  const { personas: enabled } = await loadAbilitiesFile()
  const others = [...new Set(enabled)].filter(id => id !== DEFAULT_PERSONA_ID).sort((a, b) => a.localeCompare(b))
  const ownDefault = existsSync(join(root, "personas", `${DEFAULT_PERSONA_ID}.toml`))
  const personas = await readPersonas(root, ownDefault ? [DEFAULT_PERSONA_ID, ...others] : others)
  if (personas[0]?.id !== DEFAULT_PERSONA_ID) personas.unshift(builtinDefault())
  return personas
}
