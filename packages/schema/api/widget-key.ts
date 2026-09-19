import { z } from "zod"

/** Which client-side UI the embed script renders — independent of persona (which LLM personality runs behind it). */
export const widgetTypeSchema = z.enum(["chat", "barkochba"])

export const widgetConfigSchema = z.object({
  widgetType: widgetTypeSchema.default("chat"),
  persona: z.string().min(1).optional(),
  /** Catalog skills this key's visitors get — its own list, independent of the owner's enabled packages. */
  skills: z.array(z.string().min(1)).optional()
})

export const widgetKeySchema = z.object({
  id: z.uuidv7(),
  label: z.string().min(1),
  keyPrefix: z.string().min(1),
  allowedOrigins: z.array(z.string().min(1)),
  config: widgetConfigSchema,
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable()
})

export const createWidgetKeyRequestSchema = z.object({
  label: z.string().min(1),
  allowedOrigins: z.array(z.string().min(1)).min(1),
  config: widgetConfigSchema.optional()
})

/** Any subset; `config` replaces the whole config (send widgetType, persona and skills together). */
export const updateWidgetKeyRequestSchema = z.object({
  label: z.string().min(1).optional(),
  allowedOrigins: z.array(z.string().min(1)).min(1).optional(),
  config: widgetConfigSchema.optional()
})

/** Only ever returned once, at creation — never stored or shown again. */
export const createWidgetKeyResponseSchema = widgetKeySchema.extend({
  rawKey: z.string()
})

export const listWidgetKeysResponseSchema = z.object({
  keys: z.array(widgetKeySchema)
})

export type WidgetType = z.infer<typeof widgetTypeSchema>
export type WidgetConfig = z.infer<typeof widgetConfigSchema>
export type WidgetKey = z.infer<typeof widgetKeySchema>
export type CreateWidgetKeyRequest = z.infer<typeof createWidgetKeyRequestSchema>
export type UpdateWidgetKeyRequest = z.infer<typeof updateWidgetKeyRequestSchema>
export type CreateWidgetKeyResponse = z.infer<typeof createWidgetKeyResponseSchema>
export type ListWidgetKeysResponse = z.infer<typeof listWidgetKeysResponseSchema>
