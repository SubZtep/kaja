import { z } from "zod"

/** Where a widget is installed. The homepage is the only browser page this slice mounts. */
export const widgetTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("browser"),
    page: z.literal("home"),
    selector: z
      .string()
      .regex(/^#[A-Za-z][\w-]*$/, "selector must be a CSS id such as #kaja-barkochba")
      .max(64)
  }),
  z.object({ kind: z.literal("server") })
])

const widgetLabelSchema = z.string().min(1).max(100)
const widgetIntentSchema = z.string().min(1).max(4_000)
const widgetModelSchema = z.string().min(1).max(200)

/** A stored generation. `error` is set when the model reply could not be kept; that draft cannot be published. */
export const widgetGenerationSchema = z.object({
  id: z.uuidv7(),
  source: z.string(),
  error: z.string().nullable(),
  createdAt: z.coerce.date()
})

export const widgetSchema = z.object({
  id: z.uuidv7(),
  label: widgetLabelSchema,
  intent: widgetIntentSchema,
  model: widgetModelSchema,
  target: widgetTargetSchema,
  tokenPrefix: z.string().min(1),
  enabled: z.boolean(),
  /** Widgets this one may call, by id. */
  links: z.array(z.uuidv7()),
  draft: widgetGenerationSchema.nullable(),
  published: widgetGenerationSchema.nullable(),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable()
})

export const createWidgetRequestSchema = z.object({
  label: widgetLabelSchema,
  intent: widgetIntentSchema,
  model: widgetModelSchema,
  target: widgetTargetSchema
})

/** Any subset. Changing intent, model, or target stores a new draft and leaves the published source in place. */
export const updateWidgetRequestSchema = z.object({
  label: widgetLabelSchema.optional(),
  intent: widgetIntentSchema.optional(),
  model: widgetModelSchema.optional(),
  target: widgetTargetSchema.optional()
})

/** Returned once, at creation. Only the hash is stored. */
export const createWidgetResponseSchema = widgetSchema.extend({
  rawToken: z.string()
})

export const listWidgetsResponseSchema = z.object({
  widgets: z.array(widgetSchema)
})

export const widgetLinkRequestSchema = z.object({
  to: z.uuidv7()
})

/** What a widget learns about itself. No token, no other widget's source. */
export const widgetMeSchema = z.object({
  id: z.uuidv7(),
  label: widgetLabelSchema,
  intent: widgetIntentSchema,
  model: widgetModelSchema,
  target: widgetTargetSchema,
  links: z.array(z.uuidv7()),
  publishedGenerationId: z.uuidv7().nullable()
})

export const widgetSourceResponseSchema = z.object({
  generationId: z.uuidv7(),
  source: z.string()
})

export const widgetStateResponseSchema = z.object({
  state: z.unknown().nullable()
})

export const widgetStatePutSchema = z.object({
  state: z.unknown()
})

export const aiChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(16_000)
})

export const aiChatRequestSchema = z.object({
  messages: z.array(aiChatMessageSchema).min(1).max(40)
})

export const aiChatResponseSchema = z.object({
  message: z.string(),
  usage: z.object({
    promptTokens: z.number().int(),
    completionTokens: z.number().int()
  })
})

export type WidgetTarget = z.infer<typeof widgetTargetSchema>
export type WidgetGeneration = z.infer<typeof widgetGenerationSchema>
export type Widget = z.infer<typeof widgetSchema>
export type CreateWidgetRequest = z.infer<typeof createWidgetRequestSchema>
export type UpdateWidgetRequest = z.infer<typeof updateWidgetRequestSchema>
export type CreateWidgetResponse = z.infer<typeof createWidgetResponseSchema>
export type ListWidgetsResponse = z.infer<typeof listWidgetsResponseSchema>
export type WidgetMe = z.infer<typeof widgetMeSchema>
export type AiChatMessage = z.infer<typeof aiChatMessageSchema>
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>
