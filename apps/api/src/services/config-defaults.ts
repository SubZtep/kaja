import { CATALOG_VERSION, CatalogFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import CATALOG_TOML from "../../../../config/catalog.toml" with { type: "text" }
import COMMANDS_TOML from "../../../../config/commands.toml" with { type: "text" }
import HOOKS_TOML from "../../../../config/hooks.toml" with { type: "text" }
import MODELS_DEFAULT_TOML from "../../../../config/models.default.toml" with { type: "text" }
import MODELS_LLAMA_TOML from "../../../../config/models.llama.toml" with { type: "text" }
import MODELS_OLLAMA_TOML from "../../../../config/models.ollama.toml" with { type: "text" }
import MODELS_OPENROUTER_TOML from "../../../../config/models.openrouter.toml" with { type: "text" }
import MODELS_XAI_TOML from "../../../../config/models.xai.toml" with { type: "text" }

/** The model catalog, parsed once at boot so a broken `config/catalog.toml` fails the deploy, not a request. */
export const catalogBundle = { version: CATALOG_VERSION, catalog: CatalogFileSchema.parse(TOML.parse(CATALOG_TOML)) }

/** Version-independent defaults served as text. settings.toml and secrets.toml stay out: they describe one CLI build's own options. */
export const defaultTemplates: ReadonlyMap<string, string> = new Map([
  ["commands.toml", COMMANDS_TOML],
  ["hooks.toml", HOOKS_TOML],
  ["models.default.toml", MODELS_DEFAULT_TOML],
  ["models.llama.toml", MODELS_LLAMA_TOML],
  ["models.ollama.toml", MODELS_OLLAMA_TOML],
  ["models.openrouter.toml", MODELS_OPENROUTER_TOML],
  ["models.xai.toml", MODELS_XAI_TOML]
])
