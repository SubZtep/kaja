import * as z from "zod"
import { DatasetSchema } from "../cli/datasets"
import { PersonaSchema } from "../cli/personas"
import { McpFileSchema } from "../config/mcp"
import { ModelsFileSchema } from "../config/models"
import { SecretsFileSchema } from "../config/secrets"
import { ServicesFileSchema } from "../config/services"
import { KajaConfigSchema } from "../config/settings"

/**
 * JSON Schema documents for the Tombi TOML language server (https://tombi-toml.github.io),
 * one per docs/config/*.toml shape. Each is derived from this package's own Zod schemas via
 * `z.toJSONSchema`, so it can never drift from the runtime validators. Written to static
 * .json files by ./generate.ts, which tombi.toml's [[schemas]] point at — Tombi needs
 * files/URLs, not live TypeScript.
 */
// io: "input" — fields with a Zod .default() become optional-with-default instead of
// required, matching what a user may actually omit when hand-editing the TOML file.
export const tombiSchemas = {
  "settings.json": z.toJSONSchema(KajaConfigSchema, { io: "input" }),
  "services.json": z.toJSONSchema(ServicesFileSchema, { io: "input" }),
  "secrets.json": z.toJSONSchema(SecretsFileSchema, { io: "input" }),
  "models.json": z.toJSONSchema(ModelsFileSchema, { io: "input" }),
  "mcp.json": z.toJSONSchema(McpFileSchema, { io: "input" }),
  "persona.json": z.toJSONSchema(PersonaSchema, { io: "input" }),
  "dataset.json": z.toJSONSchema(DatasetSchema, { io: "input" })
} satisfies Record<string, object>
