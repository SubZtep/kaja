import { z } from "zod"

/** Package types the cloud serves; only skills so far (HTTP tools and MCP need per-user secrets). */
export const packageTypeSchema = z.enum(["skill"])

/** One entry of the cloud catalog: what a user can enable. */
export const catalogPackageSchema = z.object({
  type: packageTypeSchema,
  name: z.string(),
  description: z.string(),
  updatedAt: z.coerce.date()
})

export const listCatalogResponseSchema = z.object({
  packages: z.array(catalogPackageSchema)
})

/** One catalog skill in full, for reading before enabling it. */
export const skillDetailSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** SKILL.md without its frontmatter: what the model reads when it loads the skill. */
  instructions: z.string(),
  /** The skill's other files, which the model can open on demand. */
  files: z.array(z.string()),
  updatedAt: z.coerce.date()
})

/** A package the user enabled; `available` is false once it left the marketplace (the choice is kept in case it returns). */
export const userPackageSchema = z.object({
  type: packageTypeSchema,
  name: z.string(),
  description: z.string(),
  enabledAt: z.coerce.date(),
  available: z.boolean()
})

export const listUserPackagesResponseSchema = z.object({
  packages: z.array(userPackageSchema)
})

export const marketplaceSyncStatusSchema = z.object({
  commit: z.string().nullable(),
  syncedAt: z.coerce.date().nullable(),
  error: z.string().nullable()
})

export const marketplaceSyncResultSchema = z.object({
  commit: z.string(),
  /** False when the branch hadn't moved since the last sync, so nothing was downloaded. */
  changed: z.boolean(),
  added: z.array(z.string()),
  updated: z.array(z.string()),
  removed: z.array(z.string())
})

export type PackageType = z.infer<typeof packageTypeSchema>
export type CatalogPackage = z.infer<typeof catalogPackageSchema>
export type ListCatalogResponse = z.infer<typeof listCatalogResponseSchema>
export type SkillDetail = z.infer<typeof skillDetailSchema>
export type UserPackage = z.infer<typeof userPackageSchema>
export type ListUserPackagesResponse = z.infer<typeof listUserPackagesResponseSchema>
export type MarketplaceSyncStatus = z.infer<typeof marketplaceSyncStatusSchema>
export type MarketplaceSyncResult = z.infer<typeof marketplaceSyncResultSchema>
