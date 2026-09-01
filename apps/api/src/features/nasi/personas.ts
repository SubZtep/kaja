import { type PersonaToml, personaTomlSchema } from "@kaja/schema/api"
import { TOML } from "bun"
// Bundled at build time (no docs/ dir is shipped in the API's Docker image), sourced from the same
// files apps/cli/lib/personas/personas.ts bundles for the CLI.
import BARKOCHBA_TEMPLATE from "../../../../../docs/config/personas/barkochba.toml" with { type: "text" }
import CARE_TEMPLATE from "../../../../../docs/config/personas/care.toml" with { type: "text" }
import DEFAULT_TEMPLATE from "../../../../../docs/config/personas/default.toml" with { type: "text" }
import ONBOARDING_TEMPLATE from "../../../../../docs/config/personas/onboarding.toml" with { type: "text" }

const TEMPLATES: Record<string, string> = {
  default: DEFAULT_TEMPLATE,
  barkochba: BARKOCHBA_TEMPLATE,
  care: CARE_TEMPLATE,
  onboarding: ONBOARDING_TEMPLATE
}

/** The hosted agent loop's persona catalog, read from docs/config/personas/*.toml (id = filename). */
export function listPersonas(): PersonaToml[] {
  return Object.entries(TEMPLATES).map(([id, text]) => ({ id, ...personaTomlSchema.parse(TOML.parse(text)) }))
}
