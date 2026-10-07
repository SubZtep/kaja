import { z } from "zod"

/** Which client-side UI the embed script renders — independent of persona (which LLM personality runs behind it). */
export const widgetTypeSchema = z.enum(["chat", "barkochba"])

/** An embedding site's origin exactly as browsers send it (`https://example.com`, `http://localhost:3000`): no path, no default port, lower case; never `null`. */
export const widgetOriginSchema = z
  .string()
  .max(256)
  .refine(value => {
    const url = URL.parse(value)
    return (url?.protocol === "https:" || url?.protocol === "http:") && url.origin === value
  }, "must be an origin like https://example.com")

export const widgetConfigSchema = z.object({
  widgetType: widgetTypeSchema.default("chat"),
  /** Where a visitor's chat starts; its `abilities` decides which skills they get (never keyed tools). */
  persona: z.string().min(1).max(128).optional()
})

const widgetLabelSchema = z.string().min(1).max(100)
const widgetOriginsSchema = z.array(widgetOriginSchema).min(1).max(20)

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
  label: widgetLabelSchema,
  allowedOrigins: widgetOriginsSchema,
  config: widgetConfigSchema.optional()
})

/** Any subset; `config` replaces the whole config (send widgetType and persona together). */
export const updateWidgetKeyRequestSchema = z.object({
  label: widgetLabelSchema.optional(),
  allowedOrigins: widgetOriginsSchema.optional(),
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
