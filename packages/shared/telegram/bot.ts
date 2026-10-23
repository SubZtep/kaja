import { createHash } from "node:crypto"

/** Telegram allows about one edit a second per message; a 429 doubles the wait, up to the cap. */
const DEFAULT_EDIT_INTERVALS = { minMs: 1000, maxMs: 4000 }

/**
 * Short, fixed-length stand-in for a pending call id in callback data (the Bot API caps it at 64 bytes; provider call
 * ids vary in length).
 */
export function approvalToken(callId: string): string {
  return createHash("sha256").update(callId).digest("hex").slice(0, 16)
}

const ASK_CALLBACK = /^ask:([0-9a-f]{16}):(\d{1,3})$/

/** Callback data of the button for a question's `index`th option, checked later against the pending question. */
export function askCallbackData(callId: string, index: number): string {
  return `ask:${approvalToken(callId)}:${index}`
}

/** A question's options as buttons, one per row, for the call with this id; none without options or the id. */
export function askButtons(
  callId: string | undefined,
  options: string[] | undefined
): { text: string; data: string }[][] | undefined {
  if (!callId || !options) return undefined
  return options.map((text, index) => [{ text, data: askCallbackData(callId, index) }])
}

/** What {@link askCallbackData} carries, or undefined for any other callback data. */
export function parseAskCallback(data: string): { token: string; index: number } | undefined {
  const match = ASK_CALLBACK.exec(data)
  return match ? { token: match[1]!, index: Number(match[2]) } : undefined
}

/** How long to wait for the rest of an album: Telegram sends each of its photos as a message of its own. */
const ALBUM_WAIT_MS = 1000

/**
 * Gathers an album's photos into one call of `onAlbum`, so they make one turn: pass each photo with its message's
 * `media_group_id` (scoped to its chat); a photo without one is passed on at once.
 */
export function albumCollector<T>(onAlbum: (items: T[]) => void, waitMs = ALBUM_WAIT_MS) {
  const albums = new Map<string, { items: T[]; timer?: ReturnType<typeof setTimeout> }>()
  return (groupId: string | undefined, item: T) => {
    if (groupId === undefined) return onAlbum([item])
    const album = albums.get(groupId) ?? { items: [] }
    clearTimeout(album.timer)
    album.items.push(item)
    album.timer = setTimeout(() => {
      albums.delete(groupId)
      onAlbum(album.items)
    }, waitMs)
    albums.set(groupId, album)
  }
}

/**
 * Plain HTML escaping for text inside <pre>: unlike renderTelegramHtml it leaves URLs as text instead of turning them
 * into links.
 */
export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

/** A bot command, with or without the `@botname` Telegram adds in groups. */
export function isCommand(text: string, name: string): boolean {
  return new RegExp(String.raw`^/${name}(@\w+)?$`).test(text.trim())
}

/** The text after `/<name>` (or `/<name>@bot`), trimmed: "" for the bare command, undefined when it's another message. */
export function commandArgument(text: string, name: string): string | undefined {
  const match = new RegExp(String.raw`^/${name}(?:@\w+)?(?:\s+([\s\S]*))?$`).exec(text.trim())
  return match ? (match[1] ?? "").trim() : undefined
}

/** Thrown by a bot's sender on a 429 response, so EditThrottle can back off. */
export class TelegramRateLimitError extends Error {
  retryAfterSec: number | undefined

  constructor(retryAfterSec: number | undefined) {
    super("Telegram rate limit")
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * Coalesces rapid delta events into at most one Telegram edit per `intervalMs`, using only the latest accumulated text
 * (never queuing multiple edits). Tuned for Telegram's ~1 edit/sec per-message budget, with 429 backoff since Telegram
 * (unlike a local terminal) can reject bursts.
 */
export class EditThrottle {
  private intervalMs: number
  private lastEditAt = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private pendingRender: (() => string) | undefined
  // sendEdit is expected to dedupe identical text itself — the throttle only decides *when* to call it.
  private readonly sendEdit: (text: string) => Promise<void>
  // Anything but a 429 is reported here; the host decides where that goes (the TUI can't print to the console).
  private readonly onError: (error: unknown) => void

  private readonly maxIntervalMs: number

  constructor(
    sendEdit: (text: string) => Promise<void>,
    onError: (error: unknown) => void,
    intervals = DEFAULT_EDIT_INTERVALS
  ) {
    this.sendEdit = sendEdit
    this.onError = onError
    this.intervalMs = intervals.minMs
    this.maxIntervalMs = intervals.maxMs
  }

  request(renderText: () => string) {
    this.pendingRender = renderText
    if (this.timer) return
    // Always goes through setTimeout, even at 0ms delay once intervalMs has elapsed — never fires synchronously inline. That guarantees cancel() (called from the same microtask chain that follows a delta, e.g. once run() reaches its final/ask_user/confirm_command event) can always pre-empt a still-pending fire, since a macrotask timer only runs after the current microtask queue has fully drained.
    const elapsed = Date.now() - this.lastEditAt
    const delay = Math.max(0, this.intervalMs - elapsed)
    this.timer = setTimeout(() => void this.fire(), delay)
  }

  private async fire() {
    this.timer = undefined
    const render = this.pendingRender
    this.pendingRender = undefined
    if (!render) return
    this.lastEditAt = Date.now()
    try {
      await this.sendEdit(render())
    } catch (error) {
      if (error instanceof TelegramRateLimitError) {
        this.intervalMs = Math.min(this.intervalMs * 2, this.maxIntervalMs)
        if (error.retryAfterSec) this.lastEditAt = Date.now() + error.retryAfterSec * 1000
      } else {
        this.onError(error)
      }
    }
  }

  /**
   * Cancels any pending trailing-edge edit without sending it — call before a caller-driven edit that's about to
   * supersede it anyway (final, ask_user, confirm_command), so the throttle doesn't fire a redundant edit moments after
   * (or race with) that one.
   */
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.pendingRender = undefined
  }
}

type BotApiError = Error & { error_code: number; description: string; parameters?: { retry_after?: number } }

// grammy's GrammyError, recognised by shape so this package doesn't depend on grammy.
function isBotApiError(error: unknown): error is BotApiError {
  return error instanceof Error && typeof (error as Partial<BotApiError>).error_code === "number"
}

/** Telegram's "message is not modified" 400 is an expected race (see EditThrottle's own dedupe guard), not an error. */
export function isNotModifiedError(error: unknown): boolean {
  return isBotApiError(error) && error.error_code === 400 && error.description.includes("message is not modified")
}

/** Translates a 429 into the typed error EditThrottle knows how to back off on. */
export function asRateLimitError(error: unknown): TelegramRateLimitError | undefined {
  if (isBotApiError(error) && error.error_code === 429) return new TelegramRateLimitError(error.parameters?.retry_after)
  return undefined
}

/**
 * Runs `send` once, and on a single 429 sleeps for its retry_after and tries exactly once more — for one-shot sends
 * (there's no throttle to defer to, unlike an edit stream, which lets TelegramRateLimitError propagate to
 * EditThrottle's own backoff). A second failure, or a 429 with no retry_after, propagates.
 */
export async function withRateLimitRetry<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send()
  } catch (error) {
    const rateLimit = asRateLimitError(error)
    if (!rateLimit?.retryAfterSec) throw error
    await Bun.sleep(rateLimit.retryAfterSec! * 1000)
    return send()
  }
}

/** The most an image sent to a bot may weigh (Telegram's own download cap is 20 MB). */
export const TELEGRAM_IMAGE_LIMIT = 10 * 1024 * 1024

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])

/** The image fields of a Telegram message, structurally, so this needs no grammy import. */
export type TelegramImageMessage = {
  photo?: { file_id: string; file_size?: number }[]
  document?: { file_id: string; mime_type?: string; file_size?: number; file_name?: string }
}

/** A message's image: the largest size of a photo, or a file sent uncompressed that is an image (with its name). */
export function incomingImage(
  message: TelegramImageMessage
): { fileId: string; mimeType: string; size?: number; fileName?: string } | undefined {
  const photo = message.photo?.at(-1)
  if (photo) return { fileId: photo.file_id, mimeType: "image/jpeg", size: photo.file_size }
  const document = message.document
  if (document?.mime_type && IMAGE_TYPES.has(document.mime_type))
    return {
      fileId: document.file_id,
      mimeType: document.mime_type,
      size: document.file_size,
      ...(document.file_name ? { fileName: document.file_name } : {})
    }
}

/** Downloads a message's image from Telegram as a data URL for the model; `getFile` is the bot's `api.getFile`. */
export async function downloadTelegramImage(
  botToken: string,
  getFile: (fileId: string) => Promise<{ file_path?: string }>,
  image: { fileId: string; mimeType: string }
): Promise<string> {
  const { file_path } = await getFile(image.fileId)
  if (!file_path) throw new Error("Telegram returned no file path")
  // A failed fetch's error carries the URL, bot token and all, and these errors end up in logs and Sentry
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file_path}`).catch(error => {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Telegram file download failed: ${reason.replaceAll(botToken, "***")}`)
  })
  if (!response.ok) throw new Error(`Telegram file download failed: HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > TELEGRAM_IMAGE_LIMIT) throw new Error("Image too large")
  return `data:${image.mimeType};base64,${new Uint8Array(bytes).toBase64()}`
}
