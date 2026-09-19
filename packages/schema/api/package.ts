import { z } from "zod"

/** Package types the cloud serves: skills and HTTP tools (MCP isn't in the cloud yet). */
export const packageTypeSchema = z.enum(["skill", "tool"])

/** Whether a package needs the user's own API key: not at all, to work at all, or only for more (e.g. higher limits). */
export const packageKeyNeedSchema = z.enum(["none", "required", "optional"])

/** What an HTTP tool package calls, shown before enabling it. */
export const httpToolDetailSchema = z.object({
  /** The host every request goes to. */
  domain: z.string(),
  key: packageKeyNeedSchema,
  tools: z.array(z.object({ name: z.string(), method: z.string(), description: z.string() }))
})

/** One entry of the cloud catalog: what a user can enable. */
export const catalogPackageSchema = z.object({
  type: packageTypeSchema,
  name: z.string(),
  description: z.string(),
  updatedAt: z.coerce.date(),
  /** HTTP tools only. */
  http: httpToolDetailSchema.optional()
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

/** A package's key, as the user types it; stored encrypted and never sent back. */
export const savePackageKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1).max(4096)
})

/** A key's live test (the package's `check` request): it works, or why not. Null when the package has no check. */
export const packageKeyCheckSchema = z.object({ ok: z.boolean(), reason: z.string().optional() }).nullable()

export const savePackageKeyResponseSchema = z.object({ check: packageKeyCheckSchema })

export const listUserPackagesResponseSchema = z.object({
  packages: z.array(userPackageSchema),
  /** Packages the user saved a key for, on or off (keys stay when a package is turned off). */
  keys: z.array(z.string()),
  /** False when the server can't store keys (USER_SECRET_KEY unset); packages that need one are then left out. */
  keysEnabled: z.boolean()
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
  /** Skill names; other packages as their marketplace path (`tools/<name>`). */
  added: z.array(z.string()),
  updated: z.array(z.string()),
  removed: z.array(z.string())
})

export type PackageType = z.infer<typeof packageTypeSchema>
export type PackageKeyNeed = z.infer<typeof packageKeyNeedSchema>
export type HttpToolDetail = z.infer<typeof httpToolDetailSchema>
export type CatalogPackage = z.infer<typeof catalogPackageSchema>
export type ListCatalogResponse = z.infer<typeof listCatalogResponseSchema>
export type SkillDetail = z.infer<typeof skillDetailSchema>
export type UserPackage = z.infer<typeof userPackageSchema>
export type ListUserPackagesResponse = z.infer<typeof listUserPackagesResponseSchema>
export type SavePackageKeyRequest = z.infer<typeof savePackageKeyRequestSchema>
export type PackageKeyCheck = z.infer<typeof packageKeyCheckSchema>
export type SavePackageKeyResponse = z.infer<typeof savePackageKeyResponseSchema>
export type MarketplaceSyncStatus = z.infer<typeof marketplaceSyncStatusSchema>
export type MarketplaceSyncResult = z.infer<typeof marketplaceSyncResultSchema>
