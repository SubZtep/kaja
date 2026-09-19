import * as z from "zod"

const turnFields = {
  session: z.uuidv7().optional(),
  message: z.string().min(1).max(32_768),
  includeThinking: z.boolean().optional(),
  /** BCP-47-ish UI language code (e.g. "en-GB", "hu-HU") the caller wants replies in — passed through to the model as a reply-language instruction. */
  language: z.string().min(2).max(10).optional(),
  /** Id of the persona to use for this turn — resolved fresh every turn (including resumed sessions), so a caller that keeps sending the same id keeps the session pinned to it. */
  personaId: z.string().optional()
}

export const NasiTurnRequestSchema = z
  .object({
    ...turnFields,
    message: turnFields.message.optional(),
    /** Answers the session's `confirm_tool` step: the server runs (or skips) the call it saved, so the client never supplies a tool result. */
    approval: z.enum(["approve", "decline"]).optional()
  })
  .refine(turn => turn.message !== undefined || turn.approval !== undefined, {
    message: "message or approval is required",
    path: ["message"]
  })

/** Same turn contract (a message every time; widget turns never ask for approval), plus the widget's client-minted visitor id (resumption token, not a credential — the widget key already authenticates the request). */
export const WidgetTurnRequestSchema = z.object({
  ...turnFields,
  visitorId: z.string().min(1).max(128)
})

export const NasiStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({ type: z.literal("message"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({ type: z.literal("tool_result"), name: z.string(), preview: z.string() }),
  z.object({ type: z.literal("ask_user"), question: z.string(), note: z.string().optional() }),
  z.object({ type: z.literal("persona_switch"), personaId: z.string(), label: z.string() }),
  z.object({ type: z.literal("confirm_command"), command: z.string(), description: z.string() }),
  z.object({ type: z.literal("client_tool_call"), name: z.string(), arguments: z.string() }),
  /** A tool call waiting for the user's OK; answer with the next turn's `approval`. `summary` is the request in one line. */
  z.object({ type: z.literal("confirm_tool"), name: z.string(), arguments: z.string(), summary: z.string() })
])

export const NasiUsageSchema = z.object({
  promptTokens: z.number().optional(),
  model: z.string().optional()
})

export const NasiTurnStatusSchema = z.enum(["completed", "needs_input", "needs_approval", "needs_client_tool", "error"])

export const NasiTurnResponseSchema = z.object({
  session: z.uuidv7(),
  status: NasiTurnStatusSchema,
  message: z.string(),
  steps: z.array(NasiStepSchema),
  thinking: z.string().optional(),
  usage: NasiUsageSchema.optional()
})

export const NasiInfoResponseSchema = z.object({
  persona: z.object({ id: z.string(), label: z.string() }),
  /** Every persona the caller can switch to, for a picker UI. */
  personas: z.array(z.object({ id: z.string(), label: z.string() })),
  model: z.string(),
  tools: z.array(z.string())
})

/** The cloud persona catalog as any signed-in user sees it: enough to pick one (e.g. for a widget). */
export const NasiPersonasResponseSchema = z.object({
  personas: z.array(z.object({ id: z.string(), label: z.string() }))
})

export type NasiTurnRequest = z.infer<typeof NasiTurnRequestSchema>
export type WidgetTurnRequest = z.infer<typeof WidgetTurnRequestSchema>
export type NasiStep = z.infer<typeof NasiStepSchema>
export type NasiTurnResponse = z.infer<typeof NasiTurnResponseSchema>
export type NasiTurnStatus = z.infer<typeof NasiTurnStatusSchema>
export type NasiInfoResponse = z.infer<typeof NasiInfoResponseSchema>
export type NasiPersonasResponse = z.infer<typeof NasiPersonasResponseSchema>
