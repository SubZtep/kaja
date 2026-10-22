import { z } from "zod"
import { CatalogFileSchema } from "../config/catalog"

export const configExportBundleSchema = z.object({
  version: z.number().int(),
  generatedAt: z.coerce.date(),
  files: z.record(z.string(), z.string())
})

export type ConfigExportBundle = z.infer<typeof configExportBundleSchema>

/** `GET /config/catalog`: the model catalog the setup wizard builds `models.toml` from. */
export const configCatalogSchema = z.object({
  version: z.number().int(),
  catalog: CatalogFileSchema
})

export type ConfigCatalog = z.infer<typeof configCatalogSchema>
