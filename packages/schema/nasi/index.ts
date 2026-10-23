import * as z from "zod"
import { PersonaSchema } from "../abilities/persona"

const turnFields = {
  session: z.uuidv7().optional(),
  message: z.string().min(1).max(32_768),
  includeThinking: z.boolean().optional(),
  /**
   * BCP-47-ish UI language code (e.g. "en-GB", "hu-HU") the caller wants replies in — passed through to the model as a
   * reply-language instruction.
   */
  language: z.string().min(2).max(10).optional(),
  /**
   * Id of the persona to use for this turn — resolved fresh every turn (including resumed sessions), so a caller that
   * keeps sending the same id keeps the session pinned to it.
   */
  personaId: z.string().max(128).optional()
}

/**
 * A tool the client runs on the user's computer, declared each turn: what the model sees of it, and the ability it
 * belongs to (none: a builtin).
 */
export const NasiClientToolSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(4096),
  parameters: z.record(z.string(), z.unknown()),
  ability: z.string().min(1).max(64).optional()
})

/** A skill of an ability the client runs: its catalog entry; a sticky one's body comes along for the system prompt. */
export const NasiClientSkillSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(1024),
  files: z.array(z.string().max(512)).max(200).default([]),
  sticky: z.boolean().optional(),
  body: z.string().max(65_536).optional()
})

/** Longest text one client tool result may carry; the client cuts longer ones. */
export const TOOL_RESULT_TEXT_MAX = 262_144
/** Most images one client tool result may carry. */
export const TOOL_RESULT_IMAGES_MAX = 4
/** Longest base64 of one client tool result image. */
export const TOOL_RESULT_IMAGE_BASE64_MAX = 4_000_000
/** Most client tool results one turn may answer. */
export const TOOL_RESULTS_MAX = 32
/** Largest `/nasi/turn` request body (a terminal's tool results with their images); every other route takes 1 MB. */
export const TURN_BODY_MAX_BYTES = 16 * 1024 * 1024

/**
 * The client's answer to one `client_tool_calls` call: its text, how it went (unset: ok), and any images it returned
 * (base64).
 */
export const NasiToolResultSchema = z.object({
  id: z.string().min(1).max(256),
  text: z.string().max(TOOL_RESULT_TEXT_MAX),
  status: z.enum(["ok", "error", "declined"]).optional(),
  images: z
    .array(
      z.object({
        data: z.string().max(TOOL_RESULT_IMAGE_BASE64_MAX),
        mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/)
      })
    )
    .max(TOOL_RESULT_IMAGES_MAX)
    .optional()
})

export const NasiTurnRequestSchema = z
  .object({
    ...turnFields,
    message: turnFields.message.optional(),
    /**
     * Answers the session's `confirm_tool` step: the server runs (or skips) the call it saved, so the client never
     * supplies a tool result. `approve_session` also stops asking about that tool for the rest of the session,
     * `approve_always` adds it to the user's allow list.
     */
    approval: z.enum(["approve", "approve_session", "decline"]).optional(),
    /** Answers the session's `client_tool_calls` step; a call left out is answered as if the computer went away. */
    toolResults: z.array(NasiToolResultSchema).max(TOOL_RESULTS_MAX).optional(),
    /**
     * The tools the client runs on the user's computer this turn; the cloud drops its own copy of any ability named
     * here.
     */
    clientTools: z.array(NasiClientToolSchema).max(256).optional(),
    /** Skills of the abilities the client runs (load_skill asks the client for them). */
    clientSkills: z.array(NasiClientSkillSchema).max(128).optional(),
    /** The user's own personas, for this turn only; one with a catalog persona's id takes its place. */
    clientPersonas: z
      .array(PersonaSchema.extend({ id: z.string().min(1).max(64) }))
      .max(64)
      .optional()
  })
  .refine(turn => turn.message !== undefined || turn.approval !== undefined || turn.toolResults !== undefined, {
    message: "message, approval or toolResults is required",
    path: ["message"]
  })

/**
 * Same turn contract (a message every time; widget turns never ask for approval), plus the widget's client-minted
 * visitor id (resumption token, not a credential — the widget key already authenticates the request).
 */
export const WidgetTurnRequestSchema = z.object({
  ...turnFields,
  visitorId: z.string().min(1).max(128)
})

/** One call a client runs: the provider's call id, which its result answers. */
export const NasiClientCallSchema = z.object({ id: z.string(), name: z.string(), arguments: z.string() })

export const NasiStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({ type: z.literal("message"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({ type: z.literal("tool_result"), name: z.string(), preview: z.string() }),
  z.object({
    type: z.literal("ask_user"),
    question: z.string(),
    note: z.string().optional(),
    /** The model called the ask_user tool; absent for a plain reply that just ends in a question mark. */
    fromTool: z.literal(true).optional()
  }),
  z.object({ type: z.literal("persona_switch"), personaId: z.string(), label: z.string() }),
  z.object({ type: z.literal("confirm_command"), command: z.string(), description: z.string() }),
  /**
   * A tool call waiting for the user's OK; answer with the next turn's `approval`. `summary` is the request in one
   * line.
   */
  z.object({ type: z.literal("confirm_tool"), name: z.string(), arguments: z.string(), summary: z.string() }),
  /** Calls for the client to run on the user's computer; answer them with the next turn's `toolResults`. */
  z.object({ type: z.literal("client_tool_calls"), calls: z.array(NasiClientCallSchema) })
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

/**
 * One live event of `POST /nasi/turn/stream` (SSE event name = `type`); `done` and `error` end the stream and have
 * their own schemas.
 */
export const NasiStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), channel: z.enum(["reasoning", "content"]), text: z.string() }),
  z.object({ type: z.literal("reasoning"), text: z.string() }),
  z.object({ type: z.literal("message"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), name: z.string(), arguments: z.string() }),
  z.object({
    type: z.literal("confirm_tool"),
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    summary: z.string()
  }),
  z.object({
    type: z.literal("ask_user"),
    question: z.string(),
    note: z.string().optional(),
    /** The model called the ask_user tool; absent for a plain reply that just ends in a question mark. */
    fromTool: z.literal(true).optional()
  }),
  z.object({ type: z.literal("persona_switch"), personaId: z.string(), label: z.string() }),
  z.object({ type: z.literal("client_tool_calls"), calls: z.array(NasiClientCallSchema) }),
  z.object({
    type: z.literal("compacted"),
    beforeTokens: z.number(),
    afterTokens: z.number(),
    dropped: z.boolean()
  }),
  z.object({ type: z.literal("condensed"), tool: z.string(), beforeTokens: z.number(), afterTokens: z.number() }),
  z.object({ type: z.literal("usage"), ...NasiUsageSchema.shape }),
  z.object({ type: z.literal("final"), content: z.string().nullable() }),
  /**
   * An image a tool returned (a screenshot, say), as its public (or data) URL; `alt` its text until `image_described`
   * replaces it.
   */
  z.object({
    type: z.literal("tool_image"),
    mimeType: z.string(),
    url: z.string(),
    ref: z.string().optional(),
    alt: z.string().optional()
  }),
  /** The image `ref` (a `tool_image`'s) has its description now. */
  z.object({ type: z.literal("image_described"), ref: z.string(), description: z.string() })
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
export type NasiClientTool = z.infer<typeof NasiClientToolSchema>
export type NasiClientSkill = z.infer<typeof NasiClientSkillSchema>
export type NasiToolResult = z.infer<typeof NasiToolResultSchema>
export type NasiClientCall = z.infer<typeof NasiClientCallSchema>
export type WidgetTurnRequest = z.infer<typeof WidgetTurnRequestSchema>
export type NasiStep = z.infer<typeof NasiStepSchema>
export type NasiTurnResponse = z.infer<typeof NasiTurnResponseSchema>
export type NasiTurnStatus = z.infer<typeof NasiTurnStatusSchema>
export type NasiStreamEvent = z.infer<typeof NasiStreamEventSchema>
export type NasiInfoResponse = z.infer<typeof NasiInfoResponseSchema>
export type NasiPersonasResponse = z.infer<typeof NasiPersonasResponseSchema>
export type NasiCompactRequest = z.infer<typeof NasiCompactRequestSchema>
export type NasiCompactResponse = z.infer<typeof NasiCompactResponseSchema>
