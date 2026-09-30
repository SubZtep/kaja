import * as z from "zod"

const turnFields = {
  session: z.uuidv7().optional(),
  message: z.string().min(1).max(32_768),
  includeThinking: z.boolean().optional(),
  /** BCP-47-ish UI language code (e.g. "en-GB", "hu-HU") the caller wants replies in — passed through to the model as a reply-language instruction. */
  language: z.string().min(2).max(10).optional(),
  /** Id of the persona to use for this turn — resolved fresh every turn (including resumed sessions), so a caller that keeps sending the same id keeps the session pinned to it. */
  personaId: z.string().max(128).optional()
}

export const NasiTurnRequestSchema = z
  .object({
    ...turnFields,
    message: turnFields.message.optional(),
    /** Answers the session's `confirm_tool` step: the server runs (or skips) the call it saved, so the client never supplies a tool result. `approve_session` also stops asking about that tool for the rest of the session, `approve_always` adds it to the user's allow list. */
    approval: z.enum(["approve", "approve_session", "approve_always", "decline"]).optional()
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
  model: z.string().optional(),
  /** The model's context window in tokens, when known. */
  contextWindow: z.number().optional()
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

/** One live event of `POST /nasi/turn/stream` (SSE event name = `type`); `done` and `error` end the stream and have their own schemas. */
export const NasiStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), channel: z.enum(["reasoning", "content"]), text: z.string() }),
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({ type: z.literal("message"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({ type: z.literal("client_tool_call"), name: z.string(), arguments: z.string() }),
  z.object({
    type: z.literal("confirm_tool"),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    summary: z.string()
  }),
  z.object({ type: z.literal("ask_user"), question: z.string(), note: z.string().optional() }),
  z.object({ type: z.literal("persona_switch"), personaId: z.string(), label: z.string() }),
  z.object({
    type: z.literal("compacted"),
    beforeTokens: z.number(),
    afterTokens: z.number(),
    dropped: z.boolean()
  }),
  z.object({ type: z.literal("condensed"), tool: z.string(), beforeTokens: z.number(), afterTokens: z.number() }),
  z.object({ type: z.literal("usage"), ...NasiUsageSchema.shape }),
  z.object({ type: z.literal("final"), content: z.string().nullable() }),
  /** An image a tool returned (a screenshot, say), as a signed or data URL. */
  z.object({ type: z.literal("tool_image"), mimeType: z.string(), url: z.string() })
])

/** The stream's closing `done` event. */
export const NasiStreamDoneSchema = z.object({ session: z.uuidv7(), status: NasiTurnStatusSchema })

/** The stream's `error` event: what failed, and its category (e.g. "tool", "network") when the server knew it. */
export const NasiStreamErrorSchema = z.object({ error: z.string(), category: z.string().optional() })

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

/** `/compact`: summarise a session now; `focus` says what the summary should keep in mind. */
export const NasiCompactRequestSchema = z.object({
  session: z.uuidv7(),
  focus: z.string().max(500).optional()
})

/** `compacted` is null when the session had nothing to summarise yet. */
export const NasiCompactResponseSchema = z.object({
  compacted: z.object({ beforeTokens: z.number(), afterTokens: z.number(), dropped: z.boolean() }).nullable()
})

export type NasiTurnRequest = z.infer<typeof NasiTurnRequestSchema>
export type WidgetTurnRequest = z.infer<typeof WidgetTurnRequestSchema>
export type NasiStep = z.infer<typeof NasiStepSchema>
export type NasiTurnResponse = z.infer<typeof NasiTurnResponseSchema>
export type NasiTurnStatus = z.infer<typeof NasiTurnStatusSchema>
export type NasiStreamEvent = z.infer<typeof NasiStreamEventSchema>
export type NasiInfoResponse = z.infer<typeof NasiInfoResponseSchema>
export type NasiPersonasResponse = z.infer<typeof NasiPersonasResponseSchema>
export type NasiCompactRequest = z.infer<typeof NasiCompactRequestSchema>
export type NasiCompactResponse = z.infer<typeof NasiCompactResponseSchema>
