import { z } from "zod"

/** Ability types the cloud serves: skills, personas, HTTP tools and remote MCP servers. */
export const abilityTypeSchema = z.enum(["skill", "persona", "tool", "mcp"])

/** The persona every user always has; it's never enabled or disabled. */
export const DEFAULT_PERSONA = "default"

/** What an HTTP tool ability calls, shown before enabling it. */
export const httpToolDetailSchema = z.object({
  /** The host every request goes to. */
  domain: z.string(),
  tools: z.array(z.object({ name: z.string(), method: z.string(), description: z.string() }))
})

/** What a remote MCP server ability connects to and offers, shown before enabling it. */
export const mcpDetailSchema = z.object({
  /** The host the server runs on. */
  domain: z.string(),
  transport: z.enum(["http", "sse"]),
  /** When its calls wait for the user's OK: never, for changes only, or every time. */
  approval: z.enum(["never", "writes", "always"]),
  /** The tools it may use (the cloud only offers abilities with a fixed list). */
  tools: z.array(z.string())
})

/** Who a persona is, shown before enabling it. */
export const personaDetailSchema = z.object({
  label: z.string(),
  /** When the model switches to it on its own; without one, only a manual pick does. */
  when: z.string().optional(),
  /** Its system prompt. */
  instructions: z.string().optional()
})

/** One entry of the cloud catalog: what a user can enable. */
export const catalogAbilitySchema = z.object({
  type: abilityTypeSchema,
  name: z.string(),
  description: z.string(),
  updatedAt: z.coerce.date(),
  /** HTTP tools only. */
  http: httpToolDetailSchema.optional(),
  /** MCP servers only. */
  mcp: mcpDetailSchema.optional(),
  /** Personas only. */
  persona: personaDetailSchema.optional()
})

export const listCatalogResponseSchema = z.object({
  abilities: z.array(catalogAbilitySchema)
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

/** An ability the user enabled; `available` is false once it left the marketplace (the choice is kept in case it returns). */
export const userAbilitySchema = z.object({
  type: abilityTypeSchema,
  name: z.string(),
  description: z.string(),
  enabledAt: z.coerce.date(),
  available: z.boolean()
})

export const listUserAbilitiesResponseSchema = z.object({
  abilities: z.array(userAbilitySchema)
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
  /** Skill names; other abilities as their marketplace path (`personas/<name>`, `tools/<name>`, `mcp/<name>`). */
  added: z.array(z.string()),
  updated: z.array(z.string()),
  removed: z.array(z.string())
})

export type AbilityType = z.infer<typeof abilityTypeSchema>
export type HttpToolDetail = z.infer<typeof httpToolDetailSchema>
export type McpDetail = z.infer<typeof mcpDetailSchema>
export type PersonaDetail = z.infer<typeof personaDetailSchema>
export type CatalogAbility = z.infer<typeof catalogAbilitySchema>
export type ListCatalogResponse = z.infer<typeof listCatalogResponseSchema>
export type SkillDetail = z.infer<typeof skillDetailSchema>
export type UserAbility = z.infer<typeof userAbilitySchema>
export type ListUserAbilitiesResponse = z.infer<typeof listUserAbilitiesResponseSchema>
export type MarketplaceSyncStatus = z.infer<typeof marketplaceSyncStatusSchema>
export type MarketplaceSyncResult = z.infer<typeof marketplaceSyncResultSchema>
