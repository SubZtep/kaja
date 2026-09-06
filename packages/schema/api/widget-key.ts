import { z } from "zod"

/** Which client-side UI the embed script renders — independent of persona (which LLM personality runs behind it). */
export const widgetTypeSchema = z.enum(["chat", "barkochba"])

export const widgetConfigSchema = z.object({
  widgetType: widgetTypeSchema.default("chat"),
  persona: z.string().min(1).optional()
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
export type CreateWidgetKeyResponse = z.infer<typeof createWidgetKeyResponseSchema>
export type ListWidgetKeysResponse = z.infer<typeof listWidgetKeysResponseSchema>
