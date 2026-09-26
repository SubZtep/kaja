import type { CallStat, ModelCallStat, Session, StepStat } from "../agent/agent"

/** Which kind of pause a session's pending tool call is waiting on. */
export type PendingKind = "ask_user" | "run_command" | "client_tool" | "tool_approval"

export type ToolCallRow = { callId: string; name: string; arguments: string }

/** What a model round cost, on the assistant message it produced. */
export type StepRow = Omit<StepStat, "at">

/** What became of a tool call, keyed by the provider's call id. The row may have been stored by an earlier save. */
export type CallUpdate = CallStat & { callId: string }

/** One conversation message as a table row: text in `content`, image parts in `parts`, assistant calls in `toolCalls`. */
export type MessageRow = {
  role: string
  content: string | null
  parts: unknown[] | null
  reasoning: string | null
  toolCallId: string | null
  toolCalls: ToolCallRow[]
  /** Set on saving, never read back. */
  step?: StepRow
}

/** A conversation split for row storage: the system prompt and pending call live on the session row, the rest is append-only. */
export type ConversationRows = {
  systemPrompt: string | null
  pending: { callId: string; kind: PendingKind } | null
  messages: MessageRow[]
  /** The latest compaction summary; `from` is the seq of the first message it doesn't cover. Stores keep every one. */
  summary: { text: string; from: number } | null
  /** Condensed oversized tool results by call id, kept beside the call; the message keeps the full output. */
  toolSummaries: Record<string, string>
  /** Set on saving, never read back. */
  calls?: CallUpdate[]
  /** Summarizer calls made since the last save; set on saving, never read back. */
  modelCalls?: ModelCallStat[]
}

/** An image a message carried inline, stored once per session under its hash. */
export type StoredImage = { hash: string; mimeType: string; data: Uint8Array }

/** What a stored message part's image URL becomes: a reference into the session's images instead of the bytes. */
export const IMAGE_REF_PREFIX = "kaja-image:"

/** An image's key within its session's store: the sha256 of its bytes, hex. */
export function imageHash(data: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(data).digest("hex")
}

/** The hashes of the stored images the parts refer to. */
export function imageRefs(parts: unknown[] | null): string[] {
  if (!parts) return []
  return parts.flatMap(part =>
    isImagePart(part) && part.image_url.url.startsWith(IMAGE_REF_PREFIX)
      ? [part.image_url.url.slice(IMAGE_REF_PREFIX.length)]
      : []
  )
}

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s

type ImagePart = { type: "image_url"; image_url: { url: string } }

function isImagePart(part: unknown): part is ImagePart {
  return (part as ImagePart)?.type === "image_url" && typeof (part as ImagePart).image_url?.url === "string"
}

/** Takes the inline (base64 data URL) images out of a message's parts, leaving a {@link IMAGE_REF_PREFIX} reference to each; a store saves the images beside the message. */
export function detachImages(parts: unknown[] | null): { parts: unknown[] | null; images: StoredImage[] } {
  if (!parts) return { parts, images: [] }
  const images: StoredImage[] = []
  const detached = parts.map(part => {
    const match = isImagePart(part) ? DATA_URL.exec(part.image_url.url) : null
    if (!match) return part
    const data = Buffer.from(match[2]!, "base64")
    const hash = imageHash(data)
    images.push({ hash, mimeType: match[1]!, data })
    return {
      ...(part as ImagePart),
      image_url: { ...(part as ImagePart).image_url, url: `${IMAGE_REF_PREFIX}${hash}` }
    }
  })
  return { parts: detached, images }
}

/** The inverse of {@link detachImages}: each reference becomes its data URL again, or a note when the image is gone. */
export function attachImages(
  parts: unknown[] | null,
  images: Map<string, Omit<StoredImage, "hash">>
): unknown[] | null {
  if (!parts) return parts
  return parts.map(part => {
    if (!isImagePart(part) || !part.image_url.url.startsWith(IMAGE_REF_PREFIX)) return part
    const image = images.get(part.image_url.url.slice(IMAGE_REF_PREFIX.length))
    if (!image) return { type: "text", text: "[an image that is no longer stored]" }
    const url = `data:${image.mimeType};base64,${Buffer.from(image.data).toString("base64")}`
    return { ...part, image_url: { ...part.image_url, url } }
  })
}

const PENDING_FIELDS = [
  ["pendingAskUserId", "ask_user"],
  ["pendingRunCommandId", "run_command"],
  ["pendingClientToolCallId", "client_tool"],
  ["pendingToolApprovalId", "tool_approval"]
] as const satisfies readonly (readonly [keyof Session, PendingKind])[]

type RawMessage = Record<string, unknown>

function toRow(message: RawMessage): MessageRow {
  const { content } = message
  const calls = Array.isArray(message.tool_calls) ? (message.tool_calls as RawMessage[]) : []
  return {
    role: String(message.role),
    content: typeof content === "string" ? content : null,
    parts: Array.isArray(content) ? content : null,
    reasoning: typeof message.reasoning_content === "string" ? message.reasoning_content : null,
    toolCallId: typeof message.tool_call_id === "string" ? message.tool_call_id : null,
    toolCalls: calls
      .filter(call => call.type === "function")
      .map(call => {
        const fn = call.function as { name: string; arguments: string }
        return { callId: String(call.id), name: fn.name, arguments: fn.arguments }
      })
  }
}

/** Splits a replayable session into rows. Lossless for what the agent writes; other provider fields on a message are dropped. */
export function splitConversation(session: unknown): ConversationRows {
  const { messages: all = [], telemetry, ...rest } = session as Omit<Session, "messages"> & { messages?: RawMessage[] }
  const [first, ...others] = all
  const hasSystem = first?.role === "system" && typeof first.content === "string"
  const pendingField = PENDING_FIELDS.find(([field]) => typeof rest[field] === "string")
  return {
    systemPrompt: hasSystem ? (first!.content as string) : null,
    pending: pendingField ? { callId: rest[pendingField[0]]!, kind: pendingField[1] } : null,
    summary: rest.summary ? { text: rest.summary.text, from: rest.summary.from - (hasSystem ? 1 : 0) } : null,
    toolSummaries: rest.toolSummaries ?? {},
    messages: (hasSystem ? others : all).map((message, at) => {
      const row = toRow(message)
      const stat = telemetry?.steps.find(step => step.at === at)
      if (!stat) return row
      const { at: _at, ...step } = stat
      return { ...row, step }
    }),
    calls: Object.entries(telemetry?.calls ?? {}).map(([callId, stat]) => ({ callId, ...stat })),
    modelCalls: telemetry?.modelCalls ?? []
  }
}

/** Takes the telemetry off a session once a store has saved it, so the next save writes only what's new. */
export function clearTelemetry(session: unknown): void {
  delete (session as Session).telemetry
}

function fromRow(row: MessageRow): RawMessage {
  const message: RawMessage = { role: row.role, content: row.parts ?? row.content }
  if (row.toolCallId !== null) message.tool_call_id = row.toolCallId
  if (row.reasoning !== null) message.reasoning_content = row.reasoning
  if (row.toolCalls.length > 0) {
    message.tool_calls = row.toolCalls.map(call => ({
      id: call.callId,
      type: "function",
      function: { name: call.name, arguments: call.arguments }
    }))
  }
  return message
}

/** The inverse of {@link splitConversation}. */
export function joinConversation(rows: ConversationRows): Session {
  const session: Session = {
    messages: [
      ...(rows.systemPrompt !== null ? [{ role: "system", content: rows.systemPrompt }] : []),
      ...rows.messages.map(fromRow)
    ] as unknown as Session["messages"]
  }
  const pendingField = rows.pending && PENDING_FIELDS.find(([, kind]) => kind === rows.pending!.kind)
  if (rows.pending && pendingField) session[pendingField[0]] = rows.pending.callId
  if (rows.summary)
    session.summary = { text: rows.summary.text, from: rows.summary.from + (rows.systemPrompt !== null ? 1 : 0) }
  if (Object.keys(rows.toolSummaries).length > 0) session.toolSummaries = rows.toolSummaries
  return session
}
