import * as z from "zod"

export const NasiTurnRequestSchema = z.object({
  session: z.uuidv7().optional(),
  message: z.string().min(1).max(32_768),
  includeThinking: z.boolean().optional()
})

/** Same turn contract, plus the widget's client-minted visitor id (resumption token, not a credential — the widget key already authenticates the request). */
export const WidgetTurnRequestSchema = NasiTurnRequestSchema.extend({
  visitorId: z.string().min(1).max(128)
})

export const NasiStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({ type: z.literal("message"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({ type: z.literal("tool_result"), name: z.string(), preview: z.string() }),
  z.object({ type: z.literal("ask_user"), question: z.string(), note: z.string().optional() }),
  z.object({ type: z.literal("persona_switch"), personaId: z.string(), label: z.string() }),
  z.object({ type: z.literal("confirm_command"), command: z.string(), description: z.string() })
])

export const NasiUsageSchema = z.object({
  promptTokens: z.number().optional(),
  model: z.string().optional()
})

export const NasiTurnStatusSchema = z.enum(["completed", "needs_input", "needs_approval", "error"])

export const NasiTurnResponseSchema = z.object({
  session: z.uuidv7(),
  status: NasiTurnStatusSchema,
  message: z.string(),
  steps: z.array(NasiStepSchema),
  thinking: z.string().optional(),
  usage: NasiUsageSchema.optional()
})

export const NasiSessionMetaSchema = z.object({
  id: z.uuidv7(),
  createdAt: z.string(),
  updatedAt: z.string(),
  persona: z.string(),
  model: z.string(),
  title: z.string()
})

export const NasiErrorBodySchema = z.object({
  error: z.string(),
  code: z.string().optional()
})

export type NasiTurnRequest = z.infer<typeof NasiTurnRequestSchema>
export type WidgetTurnRequest = z.infer<typeof WidgetTurnRequestSchema>
export type NasiStep = z.infer<typeof NasiStepSchema>
export type NasiTurnResponse = z.infer<typeof NasiTurnResponseSchema>
export type NasiTurnStatus = z.infer<typeof NasiTurnStatusSchema>
export type NasiSessionMeta = z.infer<typeof NasiSessionMetaSchema>
export type NasiErrorBody = z.infer<typeof NasiErrorBodySchema>
