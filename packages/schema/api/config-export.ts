import { z } from "zod"

export const configExportBundleSchema = z.object({
  version: z.number().int(),
  generatedAt: z.coerce.date(),
  files: z.record(z.string(), z.string())
})

export type ConfigExportBundle = z.infer<typeof configExportBundleSchema>
