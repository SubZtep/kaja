import { z } from "zod"

/** The persona every user always has, first in the roster. */
export const DEFAULT_PERSONA = "default"

/** Whether an ability needs the user's own API key: not at all, to work at all, or optional (it's keyless, or the server has its own key). */
export const abilityKeyNeedSchema = z.enum(["none", "required", "optional"])

/** An ability that takes the user's key (and some persona uses), for the Profile page's API keys list. */
export const abilityKeySchema = z.object({
  /** The ability's folder name, which the key is stored by. */
  name: z.string(),
  description: z.string(),
  /** Required to work at all, or optional (it works without one, or the server has its own; the user may still bring theirs). */
  key: z.enum(["required", "optional"]),
  /** Where its calls go: a host, or `sandbox` for a stdio MCP server. */
  domain: z.string(),
  /** Whether the user saved a key for it. */
  saved: z.boolean()
})

export const listAbilityKeysResponseSchema = z.object({
  abilities: z.array(abilityKeySchema),
  /** False when the server can't store keys (USER_SECRET_KEY unset); abilities that require one are then left out. */
  keysEnabled: z.boolean()
})

/** An ability's key, as the user types it; stored encrypted and never sent back. */
export const saveAbilityKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(1).max(4096)
})

/** A key's live test (the ability's `check` request): it works, or why not. Null when the ability has no check. */
export const abilityKeyCheckSchema = z.object({ ok: z.boolean(), reason: z.string().optional() }).nullable()

export const saveAbilityKeyResponseSchema = z.object({ check: abilityKeyCheckSchema })

export const marketplaceSyncStatusSchema = z.object({
  commit: z.string().nullable(),
  syncedAt: z.coerce.date().nullable(),
  error: z.string().nullable()
})

export const marketplaceSyncResultSchema = z.object({
  commit: z.string(),
  /** False when the branch hadn't moved since the last sync, so nothing was downloaded. */
  changed: z.boolean(),
  /** Skill names; other abilities as their marketplace path (`personas/<name>`, `abilities/<name>/tool.toml`, `abilities/<name>/mcp.toml`). */
  added: z.array(z.string()),
  updated: z.array(z.string()),
  removed: z.array(z.string())
})

export type AbilityKeyNeed = z.infer<typeof abilityKeyNeedSchema>
export type AbilityKey = z.infer<typeof abilityKeySchema>
export type ListAbilityKeysResponse = z.infer<typeof listAbilityKeysResponseSchema>
export type SaveAbilityKeyRequest = z.infer<typeof saveAbilityKeyRequestSchema>
export type AbilityKeyCheck = z.infer<typeof abilityKeyCheckSchema>
export type SaveAbilityKeyResponse = z.infer<typeof saveAbilityKeyResponseSchema>
export type MarketplaceSyncStatus = z.infer<typeof marketplaceSyncStatusSchema>
export type MarketplaceSyncResult = z.infer<typeof marketplaceSyncResultSchema>
